import type {
  AttendanceService,
  AttendanceSubmitResult,
} from '../../services/attendance/types';

const result: AttendanceSubmitResult = {
  outcome: 'accepted',
  attendance: {
    id: 'attendance-simulasi-001',
    sessionId: 'sesi-simulasi-001',
    sessionTitle: 'Pelatihan K3 Umum — Sesi Pagi',
    participantName: 'Ahmad Fauzi',
    status: 'hadir',
    markedAt: '2026-11-08T08:04:00.000Z',
  },
  requestId: 'request-simulasi-001',
};

export function createMockAttendanceService(): AttendanceService {
  return {
    listActiveSessions: () =>
      Promise.resolve([
        {
          id: 'sesi-contoh',
          title: 'Pelatihan K3 Umum — Sesi Pagi',
          schedule: '08.00–10.00 WIB',
          locationLabel: 'Ruang Pelatihan Utama',
          status: 'open',
          geoRequired: true,
        },
      ]),
    startAttendance: () =>
      Promise.resolve({
        attemptId: 'attempt-simulasi-001',
        nonce: 'nonce-hanya-simulasi',
        expiresAt: '2099-01-01T00:00:00.000Z',
        serverTime: '2026-11-08T08:03:58.000Z',
        capture: { frameCount: 12, durationMs: 1_500 },
      }),
    submitAttendance: () => Promise.resolve(result),
    reconcileAttendance: (attemptId) =>
      Promise.resolve(
        attemptId === 'attempt-simulasi-001'
          ? { status: 'confirmed', result }
          : { status: 'unknown' },
      ),
  };
}
