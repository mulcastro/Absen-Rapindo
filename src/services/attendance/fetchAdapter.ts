import { appConfig } from '../../config/appConfig';
import { csrfHeaders } from '../httpClient';
import { parseAttendanceAttempt, parseReconciliationResult } from './parsers';
import {
  ServiceError,
  type AttendanceService,
  type ParticipantSession,
  type SubmitAttendanceInput,
} from './types';

type FetchLike = typeof fetch;
const REQUEST_TIMEOUT_MS = 15_000;

function mapStatus(status: number): ServiceError {
  if (status === 401)
    return new ServiceError('unauthenticated', 'Sesi login telah berakhir.', {
      status,
    });
  if (status === 403)
    return new ServiceError(
      'forbidden',
      'Anda tidak berwenang melakukan tindakan ini.',
      { status },
    );
  if (status === 429)
    return new ServiceError(
      'rate-limited',
      'Terlalu banyak percobaan. Tunggu petunjuk server.',
      { status },
    );
  if (status >= 500)
    return new ServiceError(
      'server',
      'Layanan sedang bermasalah. Coba lagi nanti.',
      { status },
    );
  return new ServiceError('server', 'Permintaan tidak dapat diproses.', {
    status,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new ServiceError(
      'malformed-response',
      'Respons layanan bukan JSON yang valid.',
      { cause: error, status: response.status },
    );
  }
}

async function request(
  fetcher: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const timeoutController = new AbortController();
  const sourceSignal = init.signal;
  const forwardAbort = () => timeoutController.abort();
  if (sourceSignal?.aborted) forwardAbort();
  sourceSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timeoutId = window.setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetcher(input, {
      ...init,
      signal: timeoutController.signal,
    });
    if (!response.ok) {
      const body = await readJson(response).catch(() => null);
      const code =
        typeof body === 'object' &&
        body &&
        'error' in body &&
        typeof body.error === 'object' &&
        body.error &&
        'code' in body.error
          ? body.error.code
          : null;
      if (code === 'SESSION_CLOSED')
        throw new ServiceError(
          'session-closed',
          'Sesi telah ditutup oleh server.',
          { status: response.status },
        );
      if (code === 'ATTEMPT_EXPIRED')
        throw new ServiceError(
          'attempt-expired',
          'Percobaan absensi telah kedaluwarsa.',
          { status: response.status },
        );
      const detail =
        typeof body === 'object' &&
        body &&
        'detail' in body &&
        typeof body.detail === 'string'
          ? body.detail
          : null;
      throw new ServiceError(
        mapStatus(response.status).code,
        detail ?? mapStatus(response.status).message,
        { status: response.status },
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceError('timeout', 'Permintaan melewati batas waktu.', {
        cause: error,
      });
    }
    throw new ServiceError('network', 'Koneksi ke layanan terputus.', {
      cause: error,
    });
  } finally {
    window.clearTimeout(timeoutId);
    sourceSignal?.removeEventListener('abort', forwardAbort);
  }
}

export function createFetchAttendanceService(
  fetcher: FetchLike = fetch,
  csrfProvider: () => Promise<Record<string, string>> = csrfHeaders,
): AttendanceService {
  return {
    async listActiveSessions(signal) {
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/sessions/active`,
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal,
        },
      );
      const body = await readJson(response);
      if (!Array.isArray(body)) {
        throw new ServiceError(
          'malformed-response',
          'Daftar sesi dari server tidak valid.',
        );
      }
      return body.map((value): ParticipantSession => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new ServiceError(
            'malformed-response',
            'Data sesi dari server tidak valid.',
          );
        }
        const item = value as Record<string, unknown>;
        if (
          typeof item.id !== 'string' ||
          typeof item.title !== 'string' ||
          typeof item.starts_at !== 'string' ||
          typeof item.ends_at !== 'string' ||
          typeof item.geo_required !== 'boolean' ||
          item.status !== 'open'
        ) {
          throw new ServiceError(
            'malformed-response',
            'Field sesi dari server tidak valid.',
          );
        }
        return {
          id: item.id,
          title: item.title,
          schedule: `${new Date(item.starts_at).toLocaleString('id-ID')} — ${new Date(item.ends_at).toLocaleString('id-ID')}`,
          locationLabel: item.geo_required
            ? 'Lokasi diwajibkan oleh sesi'
            : 'Lokasi tidak diwajibkan',
          status: 'open',
          geoRequired: item.geo_required,
        };
      });
    },
    async startAttendance(sessionId, clientRequestId, signal) {
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/attendance/start`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            ...(await csrfProvider()),
          },
          body: JSON.stringify({
            session_id: sessionId,
            client_request_id: clientRequestId,
          }),
          signal,
        },
      );
      return parseAttendanceAttempt(await readJson(response));
    },
    async submitAttendance(input: SubmitAttendanceInput, signal) {
      const form = new FormData();
      form.set('attempt_id', input.attempt.attemptId);
      form.set('nonce', input.attempt.nonce);
      if (input.location) {
        form.set('latitude', String(input.location.latitude));
        form.set('longitude', String(input.location.longitude));
        form.set('accuracy', String(input.location.accuracy));
        form.set('captured_at', input.location.capturedAt);
      }
      input.frames.forEach((frame) =>
        form.append('frames', frame.blob, `frame_${frame.index}.jpg`),
      );
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/attendance/submit`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: await csrfProvider(),
          body: form,
          signal,
        },
      );
      await readJson(response);
      const reconciled = await this.reconcileAttendance(
        input.attempt.attemptId,
        signal,
      );
      if (reconciled.status === 'unknown') {
        throw new ServiceError(
          'reconciliation-unavailable',
          'Server belum memberikan hasil akhir percobaan.',
        );
      }
      return reconciled.result;
    },
    async reconcileAttendance(attemptId, signal) {
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/attendance/attempts/${encodeURIComponent(attemptId)}`,
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal,
        },
      );
      return parseReconciliationResult(await readJson(response));
    },
  };
}
