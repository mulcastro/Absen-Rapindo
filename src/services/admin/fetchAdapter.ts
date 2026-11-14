import { csrfHeaders, readJson, request, responseMessage } from '../httpClient';
import {
  AdminServiceError,
  type AdminService,
  type AdminSession,
  type AuditEntry,
  type IssuedInvite,
  type ParticipantSummary,
  type RosterRecapRow,
  type SessionRecap,
  type TrainingDetail,
  type TrainingDay,
  type TrainingSummary,
} from './types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Respons server tidak sesuai kontrak admin.',
    );
  }
  return value as Record<string, unknown>;
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !value) {
    throw new AdminServiceError(
      'contract-unavailable',
      `Field ${key} tidak valid.`,
    );
  }
  return value;
}

function nullableNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdminServiceError(
      'contract-unavailable',
      `Field ${key} tidak valid.`,
    );
  }
  return value;
}

function parseSession(value: unknown): AdminSession {
  const source = object(value);
  const status = text(source, 'status');
  if (!['draft', 'open', 'closed'].includes(status)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Status sesi tidak dikenal.',
    );
  }
  const geoRequired = source.geo_required;
  if (typeof geoRequired !== 'boolean') {
    throw new AdminServiceError(
      'contract-unavailable',
      'Status lokasi sesi tidak valid.',
    );
  }
  const latitude = nullableNumber(source, 'geo_latitude');
  const longitude = nullableNumber(source, 'geo_longitude');
  const lateAfter = source.late_after_min;
  if (!Number.isInteger(lateAfter)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Batas terlambat tidak valid.',
    );
  }
  const trainingId = source.training_id;
  return {
    id: text(source, 'id'),
    trainingId:
      typeof trainingId === 'string' && trainingId ? trainingId : null,
    title: text(source, 'title'),
    startsAt: text(source, 'starts_at'),
    endsAt: text(source, 'ends_at'),
    lateAfterMinutes: Number(lateAfter),
    geoRequired,
    geoCenter:
      latitude === null || longitude === null ? null : { latitude, longitude },
    dayId:
      typeof source.day_id === 'string' && source.day_id ? source.day_id : null,
    geoRadiusMeters: nullableNumber(source, 'geo_radius_m'),
    geoAccuracyMeters: nullableNumber(source, 'geo_accuracy_m'),
    status: status as AdminSession['status'],
  };
}

function parseParticipant(value: unknown): ParticipantSummary {
  const source = object(value);
  return {
    id: text(source, 'id'),
    code: text(source, 'code'),
    name: text(source, 'name'),
    active: source.active === true,
    faceEnrolled: source.face_enrolled === true,
  };
}

function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (!Number.isInteger(value)) {
    throw new AdminServiceError(
      'contract-unavailable',
      `Field ${key} tidak valid.`,
    );
  }
  return Number(value);
}

function parseTrainingSummary(value: unknown): TrainingSummary {
  const source = object(value);
  return {
    id: text(source, 'id'),
    title: text(source, 'title'),
    heldOn: text(source, 'held_on'),
    timezone: text(source, 'timezone'),
    participantCount: integer(source, 'participant_count'),
    enrolledCount: integer(source, 'enrolled_count'),
    sessionCount: integer(source, 'session_count'),
    dayCount: integer(source, 'day_count'),
  };
}

function parseTrainingDetail(value: unknown): TrainingDetail {
  const summary = parseTrainingSummary(value);
  const source = object(value);
  if (!Array.isArray(source.sessions) || !Array.isArray(source.participants)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Detail pelatihan tidak valid.',
    );
  }
  const rawDays = source.days;
  if (!Array.isArray(rawDays)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Hari pelatihan tidak valid.',
    );
  }
  return {
    ...summary,
    days: rawDays.map((value): TrainingDay => {
      const day = object(value);
      if (!Array.isArray(day.sessions)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Sesi hari pelatihan tidak valid.',
        );
      }
      return {
        id: text(day, 'id'),
        trainingId: text(day, 'training_id'),
        dayNumber: integer(day, 'day_number'),
        label: text(day, 'label'),
        heldOn: text(day, 'held_on'),
        sessions: day.sessions.map(parseSession),
      };
    }),
    sessions: source.sessions.map(parseSession),
    participants: source.participants.map(parseParticipant),
  };
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const message = await responseMessage(response);
  if (response.status === 403)
    throw new AdminServiceError('forbidden', message);
  if (response.status === 404)
    throw new AdminServiceError('not-found', message);
  throw new AdminServiceError('contract-unavailable', message);
}

function parseRecap(value: unknown): SessionRecap {
  const source = object(value);
  const rawRoster = source.roster;
  if (!Array.isArray(rawRoster)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Roster server tidak valid.',
    );
  }
  const roster: RosterRecapRow[] = rawRoster.map((raw) => {
    const row = object(raw);
    const attendanceSource = row.attendance;
    const failedSource = row.latest_failed_attempt;
    let attendance: RosterRecapRow['attendance'] = null;
    if (attendanceSource !== null) {
      const parsed = object(attendanceSource);
      const status = text(parsed, 'status');
      if (status !== 'hadir' && status !== 'terlambat') {
        throw new AdminServiceError(
          'contract-unavailable',
          'Status kehadiran tidak valid.',
        );
      }
      attendance = {
        status,
        markedAt: text(parsed, 'marked_at'),
        location: typeof parsed.location === 'string' ? parsed.location : null,
      };
    }
    return {
      participantId: text(row, 'participant_id'),
      participantName: text(row, 'participant_name'),
      attendance,
      latestFailedAttempt:
        failedSource === null
          ? null
          : {
              occurredAt: text(object(failedSource), 'occurred_at'),
              reason: text(object(failedSource), 'reason'),
            },
    };
  });
  return {
    session: parseSession(source.session),
    roster,
    stale: source.stale === true,
  };
}

function parseAuditEntry(value: unknown): AuditEntry {
  const source = object(value);
  const chainIndex = source.chain_index;
  if (!Number.isInteger(chainIndex)) {
    throw new AdminServiceError(
      'contract-unavailable',
      'Nomor audit tidak valid.',
    );
  }
  return {
    chainIndex: Number(chainIndex),
    actorRole: text(source, 'actor_role'),
    action: text(source, 'action'),
    targetType: text(source, 'target_type'),
    targetId: typeof source.target_id === 'string' ? source.target_id : null,
    createdAt: text(source, 'created_at'),
  };
}

export function createFetchAdminService(): AdminService {
  const mutation = async (path: string, init: RequestInit = {}) =>
    checked(
      await request(path, {
        ...init,
        headers: { ...(await csrfHeaders()), ...init.headers },
      }),
    );

  return {
    async listTrainings() {
      const response = await checked(await request('/admin/trainings'));
      const value = await readJson(response);
      if (!Array.isArray(value)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Daftar pelatihan tidak valid.',
        );
      }
      return value.map(parseTrainingSummary);
    },
    async createTraining(input) {
      const response = await mutation('/admin/trainings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          held_on: input.heldOn,
          timezone: 'Asia/Jakarta',
        }),
      });
      return parseTrainingDetail(await readJson(response));
    },
    async createTrainingDay(trainingId, input) {
      const response = await mutation(
        `/admin/trainings/${encodeURIComponent(trainingId)}/days`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: input.label,
            held_on: input.heldOn,
          }),
        },
      );
      const value = object(await readJson(response));
      if (!Array.isArray(value.sessions)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Hari pelatihan tidak valid.',
        );
      }
      return {
        id: text(value, 'id'),
        trainingId: text(value, 'training_id'),
        dayNumber: integer(value, 'day_number'),
        label: text(value, 'label'),
        heldOn: text(value, 'held_on'),
        sessions: value.sessions.map(parseSession),
      };
    },
    async getTraining(id) {
      const response = await checked(
        await request(`/admin/trainings/${encodeURIComponent(id)}`),
      );
      return parseTrainingDetail(await readJson(response));
    },
    async importTrainingParticipants(trainingId, rows) {
      const response = await mutation(
        `/admin/trainings/${encodeURIComponent(trainingId)}/participants/import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: rows.map((row) => ({
              code: row.participantCode,
              name: row.participantName,
            })),
          }),
        },
      );
      const source = object(await readJson(response));
      return {
        accepted: integer(source, 'accepted'),
        created: integer(source, 'created'),
        attached: integer(source, 'attached'),
      };
    },
    async issueTrainingInvites(trainingId, purpose) {
      const response = await mutation(
        `/admin/trainings/${encodeURIComponent(trainingId)}/invites`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose, only_pending: true }),
        },
      );
      const source = object(await readJson(response));
      if (!Array.isArray(source.invites)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Hasil undangan pelatihan tidak valid.',
        );
      }
      return {
        issued: integer(source, 'issued'),
        expiresAt: text(source, 'expires_at'),
        invites: source.invites.map((item): IssuedInvite => {
          const row = object(item);
          return {
            participantId: text(row, 'participant_id'),
            code: text(row, 'code'),
            name: text(row, 'name'),
            token: text(row, 'token'),
            expiresAt: text(row, 'expires_at'),
          };
        }),
      };
    },
    async listSessions() {
      const response = await checked(await request('/admin/sessions'));
      const value = await readJson(response);
      if (!Array.isArray(value))
        throw new AdminServiceError(
          'contract-unavailable',
          'Daftar sesi tidak valid.',
        );
      return value.map(parseSession);
    },
    async createSession(input) {
      const response = await mutation('/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          training_id: input.trainingId,
          day_id: input.dayId ?? null,
          title: input.title,
          starts_at: new Date(input.startsAt).toISOString(),
          ends_at: new Date(input.endsAt).toISOString(),
          timezone: 'Asia/Jakarta',
          late_after_min: input.lateAfterMinutes,
          geo_required: input.geoRequired,
          geo_latitude: input.geoCenter?.latitude ?? null,
          geo_longitude: input.geoCenter?.longitude ?? null,
          geo_radius_m: input.geoRadiusMeters,
          geo_accuracy_m: input.geoAccuracyMeters,
        }),
      });
      return parseSession(await readJson(response));
    },
    async updateSession(id, input) {
      const response = await mutation(
        `/admin/sessions/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: input.title,
            starts_at: new Date(input.startsAt).toISOString(),
            ends_at: new Date(input.endsAt).toISOString(),
            timezone: 'Asia/Jakarta',
            late_after_min: input.lateAfterMinutes,
            geo_required: input.geoRequired,
            geo_latitude: input.geoCenter?.latitude ?? null,
            geo_longitude: input.geoCenter?.longitude ?? null,
            geo_radius_m: input.geoRadiusMeters,
            geo_accuracy_m: input.geoAccuracyMeters,
          }),
        },
      );
      return parseSession(await readJson(response));
    },
    async openSession(id) {
      const response = await mutation(
        `/admin/sessions/${encodeURIComponent(id)}/open`,
        { method: 'POST' },
      );
      return parseSession(await readJson(response));
    },
    async closeSession(id) {
      const response = await mutation(
        `/admin/sessions/${encodeURIComponent(id)}/close`,
        { method: 'POST' },
      );
      return parseSession(await readJson(response));
    },
    async listParticipants() {
      const response = await checked(await request('/admin/participants'));
      const value = await readJson(response);
      if (!Array.isArray(value)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Daftar peserta tidak valid.',
        );
      }
      return value.map(parseParticipant);
    },
    async getRecap(id) {
      const response = await checked(
        await request(`/admin/sessions/${encodeURIComponent(id)}/attendance`),
      );
      return parseRecap(await readJson(response));
    },
    async importParticipants(rows) {
      const response = await mutation('/admin/participants/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((row) => ({
            code: row.participantCode,
            name: row.participantName,
          })),
        }),
      });
      const source = object(await readJson(response));
      if (!Number.isInteger(source.accepted)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Jumlah peserta hasil impor tidak valid.',
        );
      }
      return { accepted: Number(source.accepted) };
    },
    async issueInvite(participantId, purpose) {
      const response = await mutation(
        `/admin/participants/${encodeURIComponent(participantId)}/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose }),
        },
      );
      const source = object(await readJson(response));
      return {
        status: 'issued',
        token: text(source, 'token'),
        expiresAt: text(source, 'expires_at'),
      };
    },
    async requestExport(id, format) {
      const response = await checked(
        await request(
          `/admin/sessions/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
          {
            headers: {
              Accept:
                format === 'xlsx'
                  ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                  : 'application/pdf',
            },
          },
        ),
      );
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        `daftar-hadir.${format}`;
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    },
    async listAudit(offset = 0, limit = 25) {
      const response = await checked(
        await request(`/admin/audit?offset=${offset}&limit=${limit}`),
      );
      const source = object(await readJson(response));
      if (!Array.isArray(source.items) || !Number.isInteger(source.total)) {
        throw new AdminServiceError(
          'contract-unavailable',
          'Daftar audit tidak valid.',
        );
      }
      return {
        items: source.items.map(parseAuditEntry),
        offset: Number(source.offset),
        limit: Number(source.limit),
        total: Number(source.total),
      };
    },
    async verifyAudit() {
      const source = object(
        await readJson(await checked(await request('/admin/audit/verify'))),
      );
      if (typeof source.valid !== 'boolean') {
        throw new AdminServiceError(
          'contract-unavailable',
          'Hasil pemeriksaan audit tidak valid.',
        );
      }
      return { valid: source.valid };
    },
  };
}
