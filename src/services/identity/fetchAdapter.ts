import { csrfHeaders, readJson, request, responseMessage } from '../httpClient';
import {
  IdentityContractError,
  type AuthSession,
  type EnrollmentChallenge,
  type EnrollmentInvite,
  type EnrollmentResult,
  type IdentityService,
} from './types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IdentityContractError('Respons server tidak sesuai kontrak.');
  }
  return value as Record<string, unknown>;
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !value) {
    throw new IdentityContractError(`Field ${key} tidak valid.`);
  }
  return value;
}

function parseSession(value: unknown): AuthSession {
  const source = object(value);
  const role = text(source, 'role');
  if (!['participant', 'instructor', 'admin'].includes(role)) {
    throw new IdentityContractError('Peran pengguna tidak dikenal.');
  }
  return { displayName: text(source, 'display_name'), role } as AuthSession;
}

async function checked(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(await responseMessage(response));
  return response;
}

function parseInvite(value: unknown): EnrollmentInvite {
  const source = object(value);
  const status = text(source, 'status');
  const purpose = text(source, 'purpose');
  if (!['valid', 'expired', 'used'].includes(status)) {
    throw new IdentityContractError('Status undangan tidak dikenal.');
  }
  if (purpose !== 'enroll' && purpose !== 'reenroll') {
    throw new IdentityContractError('Tujuan undangan tidak dikenal.');
  }
  const consent = source.consent;
  if (status === 'valid' && consent === null) {
    throw new IdentityContractError(
      'Teks dan versi persetujuan belum dikonfigurasi server.',
    );
  }
  const parsedConsent = object(consent);
  if (typeof parsedConsent.draft !== 'boolean') {
    throw new IdentityContractError('Status draf persetujuan tidak valid.');
  }
  return {
    status,
    purpose,
    participantName: text(source, 'participant_name'),
    consent: {
      version: text(parsedConsent, 'version'),
      text: text(parsedConsent, 'text'),
      draft: parsedConsent.draft,
    },
  } as EnrollmentInvite;
}

function parseChallenge(value: unknown): EnrollmentChallenge {
  const source = object(value);
  const capture = object(source.capture);
  const rawSteps = source.ordered_steps;
  if (!Array.isArray(rawSteps)) {
    throw new IdentityContractError('Urutan challenge tidak valid.');
  }
  const stepMap = {
    hadap_depan: 'lurus',
    menoleh_kiri: 'kiri',
    menoleh_kanan: 'kanan',
  } as const;
  const orderedSteps = rawSteps.map((step) => {
    if (typeof step !== 'string' || !(step in stepMap)) {
      throw new IdentityContractError('Arah challenge tidak dikenal.');
    }
    return stepMap[step as keyof typeof stepMap];
  });
  const frameCount = capture.frame_count;
  const durationMs = capture.duration_ms;
  if (!Number.isInteger(frameCount) || !Number.isInteger(durationMs)) {
    throw new IdentityContractError('Konfigurasi capture tidak valid.');
  }
  return {
    challengeId: text(source, 'challenge_id'),
    nonce: text(source, 'nonce'),
    expiresAt: text(source, 'expires_at'),
    orderedSteps,
    capture: { frameCount: Number(frameCount), durationMs: Number(durationMs) },
  };
}

export function createFetchIdentityService(): IdentityService {
  return {
    async login(input) {
      const participant = input.role === 'participant';
      const response = await checked(
        await request(participant ? '/auth/login' : '/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            participant
              ? { identifier: input.identifier, pin: input.secret }
              : {
                  identifier: input.identifier,
                  password: input.secret,
                  totp: input.totp,
                },
          ),
        }),
      );
      return parseSession(await readJson(response));
    },
    async restore() {
      const response = await request('/auth/me');
      if (response.status === 401) return null;
      await checked(response);
      return parseSession(await readJson(response));
    },
    async logout() {
      const response = await request('/auth/logout', {
        method: 'POST',
        headers: await csrfHeaders(),
      });
      await checked(response);
    },
    async getInvite(token) {
      const response = await checked(
        await request(`/enroll/${encodeURIComponent(token)}`),
      );
      return parseInvite(await readJson(response));
    },
    async createChallenge(token) {
      const response = await checked(
        await request(`/enroll/${encodeURIComponent(token)}/challenge`, {
          method: 'POST',
        }),
      );
      return parseChallenge(await readJson(response));
    },
    async submitEnrollment(input): Promise<EnrollmentResult> {
      const form = new FormData();
      form.set('nonce', input.nonce);
      form.set('consent_version', input.consentVersion);
      form.set('consent_accepted', String(input.consentAccepted));
      form.set('pin', input.pin);
      input.frames.forEach((frame) =>
        form.append('frames', frame.blob, `frame-${frame.index}.jpg`),
      );
      input.oldFaceFrames?.forEach((frame) =>
        form.append(
          'old_face_frames',
          frame.blob,
          `old-face-${frame.index}.jpg`,
        ),
      );
      const response = await request(
        `/enroll/${encodeURIComponent(input.token)}/submit`,
        { method: 'POST', body: form },
      );
      if (response.ok) return { status: 'enrolled' };
      const message = await responseMessage(response);
      if (response.status === 410) return { status: 'expired', message };
      if (message.toLowerCase().includes('telah terdaftar')) {
        return { status: 'duplicate', message };
      }
      return { status: 'rejected', message };
    },
  };
}
