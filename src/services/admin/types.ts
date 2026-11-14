export type AdminSessionStatus = 'draft' | 'open' | 'closed';

export interface AdminSession {
  id: string;
  trainingId: string | null;
  dayId: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  lateAfterMinutes: number;
  geoRequired: boolean;
  geoCenter: { latitude: number; longitude: number } | null;
  geoRadiusMeters: number | null;
  geoAccuracyMeters: number | null;
  status: AdminSessionStatus;
}

export type CreateSessionInput = Omit<
  AdminSession,
  'id' | 'status' | 'trainingId' | 'dayId'
> & {
  trainingId: string;
  dayId?: string | null;
};

export type UpdateSessionInput = Omit<
  CreateSessionInput,
  'trainingId' | 'dayId'
>;

export interface AttendanceRecord {
  status: 'hadir' | 'terlambat';
  markedAt: string;
  location: string | null;
}

export interface FailedAttempt {
  occurredAt: string;
  reason: string;
}

export interface RosterRecapRow {
  participantId: string;
  participantName: string;
  attendance: AttendanceRecord | null;
  latestFailedAttempt: FailedAttempt | null;
}

export interface SessionRecap {
  session: AdminSession;
  roster: readonly RosterRecapRow[];
  stale: boolean;
}

export interface CsvPreviewRow {
  participantCode: string;
  participantName: string;
}

export interface ParticipantSummary {
  id: string;
  code: string;
  name: string;
  active: boolean;
  faceEnrolled: boolean;
}

export interface TrainingSummary {
  id: string;
  title: string;
  heldOn: string;
  timezone: string;
  participantCount: number;
  enrolledCount: number;
  sessionCount: number;
  dayCount: number;
}

export interface TrainingDay {
  id: string;
  trainingId: string;
  dayNumber: number;
  label: string;
  heldOn: string;
  sessions: readonly AdminSession[];
}

export interface TrainingDetail extends TrainingSummary {
  days: readonly TrainingDay[];
  sessions: readonly AdminSession[];
  participants: readonly ParticipantSummary[];
}

export interface IssuedInvite {
  participantId: string;
  code: string;
  name: string;
  token: string;
  expiresAt: string;
}

export interface AuditEntry {
  chainIndex: number;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

export interface AuditPage {
  items: readonly AuditEntry[];
  offset: number;
  limit: number;
  total: number;
}

export interface AdminService {
  listTrainings(): Promise<readonly TrainingSummary[]>;
  createTraining(input: {
    title: string;
    heldOn: string;
  }): Promise<TrainingDetail>;
  createTrainingDay(
    trainingId: string,
    input: { label: string; heldOn: string },
  ): Promise<TrainingDay>;
  getTraining(id: string): Promise<TrainingDetail>;
  importTrainingParticipants(
    trainingId: string,
    rows: readonly CsvPreviewRow[],
  ): Promise<{ accepted: number; created: number; attached: number }>;
  issueTrainingInvites(
    trainingId: string,
    purpose: 'enroll' | 'reenroll',
  ): Promise<{
    issued: number;
    expiresAt: string;
    invites: readonly IssuedInvite[];
  }>;
  listSessions(): Promise<readonly AdminSession[]>;
  createSession(input: CreateSessionInput): Promise<AdminSession>;
  updateSession(id: string, input: UpdateSessionInput): Promise<AdminSession>;
  openSession(id: string): Promise<AdminSession>;
  closeSession(id: string): Promise<AdminSession>;
  listParticipants(): Promise<readonly ParticipantSummary[]>;
  getRecap(id: string): Promise<SessionRecap>;
  importParticipants(
    rows: readonly CsvPreviewRow[],
  ): Promise<{ accepted: number }>;
  issueInvite(
    participantId: string,
    purpose: 'enroll' | 'reenroll',
  ): Promise<{ status: 'issued'; token?: string; expiresAt?: string }>;
  requestExport(id: string, format: 'xlsx' | 'pdf'): Promise<void>;
  listAudit(offset?: number, limit?: number): Promise<AuditPage>;
  verifyAudit(): Promise<{ valid: boolean }>;
}

export class AdminServiceError extends Error {
  readonly code: 'forbidden' | 'not-found' | 'contract-unavailable';

  constructor(code: AdminServiceError['code'], message: string) {
    super(message);
    this.name = 'AdminServiceError';
    this.code = code;
  }
}
