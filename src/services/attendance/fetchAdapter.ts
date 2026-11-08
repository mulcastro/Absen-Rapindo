import { appConfig } from '../../config/appConfig';
import {
  parseAttendanceAttempt,
  parseAttendanceResult,
  parseReconciliationResult,
} from './parsers';
import {
  ServiceError,
  type AttendanceService,
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
      throw mapStatus(response.status);
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
): AttendanceService {
  return {
    async startAttendance(sessionId, clientRequestId, signal) {
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/attendance/start`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
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
      form.set(
        'metadata',
        JSON.stringify({
          attempt_id: input.attempt.attemptId,
          nonce: input.attempt.nonce,
          client_request_id: input.clientRequestId,
          session_id: input.sessionId,
          location: input.location
            ? {
                latitude: input.location.latitude,
                longitude: input.location.longitude,
                accuracy_m: input.location.accuracy,
                captured_at: input.location.capturedAt,
              }
            : null,
          frames: input.frames.map((frame) => ({
            index: frame.index,
            captured_at: frame.capturedAt,
            elapsed_ms: frame.elapsedMs,
          })),
        }),
      );
      input.frames.forEach((frame) =>
        form.append(
          `frame_${frame.index}`,
          frame.blob,
          `frame_${frame.index}.jpg`,
        ),
      );
      const response = await request(
        fetcher,
        `${appConfig.apiBaseUrl}/attendance/submit`,
        {
          method: 'POST',
          credentials: 'same-origin',
          body: form,
          signal,
        },
      );
      return parseAttendanceResult(await readJson(response));
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
