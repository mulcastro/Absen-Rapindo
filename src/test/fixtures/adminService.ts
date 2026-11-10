import {
  AdminServiceError,
  type AdminService,
  type AdminSession,
  type RosterRecapRow,
} from '../../services/admin/types';

const sessions: AdminSession[] = [
  {
    id: 'sesi-contoh',
    title: 'Pelatihan K3 — Sesi Pagi',
    startsAt: '2026-11-10T08:00',
    endsAt: '2026-11-10T10:00',
    lateAfterMinutes: 15,
    geoRequired: false,
    geoCenter: null,
    geoRadiusMeters: null,
    geoAccuracyMeters: null,
    status: 'open',
  },
];

const roster: RosterRecapRow[] = [
  {
    participantId: 'p-001',
    participantName: 'Ayu Pratama',
    attendance: {
      status: 'hadir',
      markedAt: '08.04',
      location: 'Dikonfirmasi server',
    },
    latestFailedAttempt: { occurredAt: '08.20', reason: 'Wajah belum cocok' },
  },
  {
    participantId: 'p-002',
    participantName: 'Bima Saputra',
    attendance: {
      status: 'terlambat',
      markedAt: '08.19',
      location: 'Dikonfirmasi server',
    },
    latestFailedAttempt: null,
  },
  {
    participantId: 'p-003',
    participantName: 'Citra Lestari',
    attendance: null,
    latestFailedAttempt: {
      occurredAt: '08.10',
      reason: 'Lokasi belum memenuhi syarat',
    },
  },
  {
    participantId: 'p-004',
    participantName: 'Dimas Anwar',
    attendance: null,
    latestFailedAttempt: null,
  },
  {
    participantId: 'p-005',
    participantName: 'Eka Putri',
    attendance: null,
    latestFailedAttempt: null,
  },
  {
    participantId: 'p-006',
    participantName: 'Fajar Nugraha',
    attendance: {
      status: 'hadir',
      markedAt: '08.07',
      location: 'Dikonfirmasi server',
    },
    latestFailedAttempt: null,
  },
  {
    participantId: 'p-007',
    participantName: 'Gita Sari',
    attendance: {
      status: 'hadir',
      markedAt: '08.09',
      location: 'Dikonfirmasi server',
    },
    latestFailedAttempt: null,
  },
  {
    participantId: 'p-008',
    participantName: 'Hendra Wijaya',
    attendance: {
      status: 'hadir',
      markedAt: '08.11',
      location: 'Dikonfirmasi server',
    },
    latestFailedAttempt: null,
  },
];

function findSession(id: string) {
  const session = sessions.find((item) => item.id === id);
  if (!session)
    throw new AdminServiceError('not-found', 'Sesi tidak ditemukan.');
  return session;
}

export function createMockAdminService(): AdminService {
  return {
    listSessions: () =>
      Promise.resolve(sessions.map((session) => ({ ...session }))),
    createSession: (input) => {
      const created: AdminSession = {
        ...input,
        id: `sesi-simulasi-${sessions.length + 1}`,
        status: 'draft',
      };
      sessions.push(created);
      return Promise.resolve({ ...created });
    },
    openSession: (id) => {
      const session = findSession(id);
      session.status = 'open';
      return Promise.resolve({ ...session });
    },
    closeSession: (id) => {
      const session = findSession(id);
      session.status = 'closed';
      return Promise.resolve({ ...session });
    },
    getRecap: (id) => {
      if (id === 'forbidden') {
        return Promise.reject(
          new AdminServiceError(
            'forbidden',
            'Anda tidak berwenang melihat rekap ini.',
          ),
        );
      }
      return Promise.resolve({
        session: { ...findSession(id) },
        roster: roster.map((row) => ({ ...row })),
        stale: false,
      });
    },
    importParticipants: (rows) => Promise.resolve({ accepted: rows.length }),
    issueInvite: () => Promise.resolve({ status: 'issued' }),
    requestExport: () => Promise.resolve(),
    listAudit: (offset = 0, limit = 25) => {
      const items = [
        {
          chainIndex: 3,
          actorRole: 'admin',
          action: 'session.opened',
          targetType: 'session',
          targetId: 'sesi-contoh',
          createdAt: '2026-11-10T08:00:00+07:00',
        },
        {
          chainIndex: 2,
          actorRole: 'admin',
          action: 'participant.imported',
          targetType: 'participant',
          targetId: null,
          createdAt: '2026-11-09T16:20:00+07:00',
        },
        {
          chainIndex: 1,
          actorRole: 'admin',
          action: 'session.created',
          targetType: 'session',
          targetId: 'sesi-contoh',
          createdAt: '2026-11-09T15:45:00+07:00',
        },
      ];
      return Promise.resolve({
        items: items.slice(offset, offset + limit),
        offset,
        limit,
        total: items.length,
      });
    },
    verifyAudit: () => Promise.resolve({ valid: true }),
  };
}
