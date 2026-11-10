import type {
  EnrollmentInvite,
  IdentityService,
} from '../../services/identity/types';

function inviteFor(token: string): EnrollmentInvite {
  const status = ['expired', 'used', 'duplicate', 'rejected'].includes(token)
    ? (token as EnrollmentInvite['status'])
    : 'valid';
  return {
    status,
    participantName: 'Ahmad Fauzi',
    purpose: token === 'reenroll' ? 'reenroll' : 'enroll',
    consent: {
      version: 'draft-simulasi-v1',
      text: 'Saya memahami bahwa data wajah akan diproses untuk keperluan verifikasi identitas dan absensi pelatihan.',
      draft: true,
    },
  };
}

export function createMockIdentityService(): IdentityService {
  return {
    login: ({ identifier, role }) =>
      Promise.resolve({
        displayName: identifier,
        role: role === 'participant' ? 'participant' : 'admin',
      }),
    restore: () => Promise.resolve(null),
    logout: () => Promise.resolve(),
    getInvite: (token) => Promise.resolve(inviteFor(token)),
    createChallenge: () =>
      Promise.resolve({
        challengeId: 'challenge-simulasi-001',
        nonce: 'nonce-simulasi-001',
        expiresAt: '2099-01-01T00:00:00.000Z',
        orderedSteps: ['lurus', 'kanan'],
        capture: { frameCount: 16, durationMs: 4_000 },
      }),
    submitEnrollment: ({ token }) =>
      Promise.resolve(
        token === 'challenge-expired'
          ? {
              status: 'expired',
              message: 'Challenge simulasi telah kedaluwarsa.',
            }
          : token === 'rejected'
            ? { status: 'rejected', message: 'Simulasi enrollment ditolak.' }
            : token === 'duplicate'
              ? { status: 'duplicate', message: 'Peserta sudah terdaftar.' }
              : { status: 'enrolled' },
      ),
  };
}
