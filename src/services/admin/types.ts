export type AdminSessionStatus = 'draft' | 'open' | 'closed';

export interface AdminSession {
  id: string;
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

export type CreateSessionInput = Omit<AdminSession, 'id' | 'status'>;

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
  listSessions(): Promise<readonly AdminSession[]>;
  createSession(input: CreateSessionInput): Promise<AdminSession>;
  openSession(id: string): Promise<AdminSession>;
  closeSession(id: string): Promise<AdminSession>;
  getRecap(id: string): Promise<SessionRecap>;
  importParticipants(
    rows: readonly CsvPreviewRow[],
  ): Promise<{ accepted: number }>;
  issueInvite(
    participantCode: string,
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
