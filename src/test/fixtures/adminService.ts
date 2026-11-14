import {
  AdminServiceError,
  type AdminService,
  type AdminSession,
  type IssuedInvite,
  type ParticipantSummary,
  type RosterRecapRow,
  type TrainingDetail,
  type TrainingSummary,
} from '../../services/admin/types';

const sessions: AdminSession[] = [
  {
    id: 'sesi-contoh',
    trainingId: 'pelatihan-contoh',
    dayId: null,
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

const participants: ParticipantSummary[] = [
  {
    id: 'p-001',
    code: 'P-001',
    name: 'Ayu Pratama',
    active: true,
    faceEnrolled: true,
  },
  {
    id: 'p-003',
    code: 'P-003',
    name: 'Citra Lestari',
    active: true,
    faceEnrolled: false,
  },
];

const trainings: TrainingDetail[] = [
  {
    id: 'pelatihan-contoh',
    title: 'Pelatihan K3',
    heldOn: '2026-11-10',
    timezone: 'Asia/Jakarta',
    participantCount: 2,
    enrolledCount: 1,
    sessionCount: 1,
    dayCount: 0,
    days: [],
    sessions: sessions,
    participants,
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

function findTraining(id: string) {
  const training = trainings.find((item) => item.id === id);
  if (!training)
    throw new AdminServiceError('not-found', 'Pelatihan tidak ditemukan.');
  return training;
}

function toSummary(item: TrainingDetail): TrainingSummary {
  return {
    id: item.id,
    title: item.title,
    heldOn: item.heldOn,
    timezone: item.timezone,
    participantCount: item.participants.length,
    enrolledCount: item.participants.filter((row) => row.faceEnrolled).length,
    sessionCount: item.sessions.length,
    dayCount: item.days.length,
  };
}

export function createMockAdminService(): AdminService {
  return {
    listTrainings: () => Promise.resolve(trainings.map(toSummary)),
    createTraining: (input) => {
      const created: TrainingDetail = {
        id: `pelatihan-${trainings.length + 1}`,
        title: input.title,
        heldOn: input.heldOn,
        timezone: 'Asia/Jakarta',
        participantCount: 0,
        enrolledCount: 0,
        sessionCount: 0,
        dayCount: 0,
        days: [],
        sessions: [],
        participants: [],
      };
      trainings.push(created);
      return Promise.resolve({ ...created, sessions: [], participants: [] });
    },
    createTrainingDay: (trainingId, input) => {
      const training = findTraining(trainingId);
      const day = {
        id: `hari-${training.days.length + 1}`,
        trainingId,
        dayNumber: training.days.length + 1,
        label: input.label,
        heldOn: input.heldOn,
        sessions: [],
      };
      training.days = [...training.days, day];
      return Promise.resolve(day);
    },
    getTraining: (id) => {
      const training = findTraining(id);
      return Promise.resolve({
        ...toSummary(training),
        days: training.days.map((day) => ({
          ...day,
          sessions: day.sessions.map((session) => ({ ...session })),
        })),
        sessions: training.sessions.map((session) => ({ ...session })),
        participants: training.participants.map((item) => ({ ...item })),
      });
    },
    importTrainingParticipants: (trainingId, rows) => {
      const training = findTraining(trainingId);
      for (const row of rows) {
        if (
          training.participants.some(
            (item) => item.code === row.participantCode,
          )
        ) {
          continue;
        }
        training.participants = [
          ...training.participants,
          {
            id: `p-new-${training.participants.length}`,
            code: row.participantCode,
            name: row.participantName,
            active: true,
            faceEnrolled: false,
          },
        ];
      }
      return Promise.resolve({
        accepted: rows.length,
        created: rows.length,
        attached: rows.length,
      });
    },
    issueTrainingInvites: (trainingId) => {
      const training = findTraining(trainingId);
      const pending = training.participants.filter(
        (item) => !item.faceEnrolled,
      );
      const invites: IssuedInvite[] = pending.map((item) => ({
        participantId: item.id,
        code: item.code,
        name: item.name,
        token: `token-${item.id}`,
        expiresAt: '2026-11-17T00:00:00+07:00',
      }));
      return Promise.resolve({
        issued: invites.length,
        expiresAt: '2026-11-17T00:00:00+07:00',
        invites,
      });
    },
    listSessions: () =>
      Promise.resolve(sessions.map((session) => ({ ...session }))),
    createSession: (input) => {
      const created: AdminSession = {
        ...input,
        dayId: input.dayId ?? null,
        id: `sesi-simulasi-${sessions.length + 1}`,
        status: 'draft',
      };
      sessions.push(created);
      const training = trainings.find((item) => item.id === input.trainingId);
      if (training) {
        training.sessions = [...training.sessions, created];
      }
      return Promise.resolve({ ...created });
    },
    updateSession: (id, input) => {
      const session = findSession(id);
      Object.assign(session, input);
      return Promise.resolve({ ...session });
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
    listParticipants: () =>
      Promise.resolve(participants.map((item) => ({ ...item }))),
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
    issueInvite: () =>
      Promise.resolve({
        status: 'issued',
        token: 'token-simulasi',
        expiresAt: '2026-11-17T00:00:00+07:00',
      }),
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
