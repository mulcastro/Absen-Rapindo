import type { CapturedFrame } from '../../features/camera/types';
import type { LocationCapture } from '../../features/location/types';

export interface CapturePolicy {
  frameCount: number;
  durationMs: number;
}

export interface ParticipantSession {
  id: string;
  title: string;
  schedule: string;
  locationLabel: string;
  status: 'open';
  geoRequired: boolean;
}

export interface AttendanceAttempt {
  attemptId: string;
  nonce: string;
  expiresAt: string;
  serverTime: string;
  capture: CapturePolicy;
}

export interface ConfirmedAttendance {
  id: string;
  sessionId: string;
  sessionTitle?: string;
  participantName: string;
  status: 'hadir' | 'terlambat';
  markedAt: string;
}

export type AttendanceSubmitResult =
  | {
      outcome: 'accepted' | 'already_recorded';
      attendance: ConfirmedAttendance;
      requestId: string;
    }
  | {
      outcome: 'rejected';
      category: string;
      message: string;
      requestId: string;
    };

export interface SubmitAttendanceInput {
  attempt: AttendanceAttempt;
  clientRequestId: string;
  sessionId: string;
  location: LocationCapture | null;
  frames: readonly CapturedFrame[];
}

export type ReconciliationResult =
  | { status: 'confirmed'; result: AttendanceSubmitResult }
  | { status: 'unknown' };

export interface AttendanceService {
  listActiveSessions(
    signal?: AbortSignal,
  ): Promise<readonly ParticipantSession[]>;
  startAttendance(
    sessionId: string,
    clientRequestId: string,
    signal?: AbortSignal,
  ): Promise<AttendanceAttempt>;
  submitAttendance(
    input: SubmitAttendanceInput,
    signal?: AbortSignal,
  ): Promise<AttendanceSubmitResult>;
  reconcileAttendance(
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<ReconciliationResult>;
}

export type ServiceErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'rate-limited'
  | 'session-closed'
  | 'attempt-expired'
  | 'server'
  | 'network'
  | 'timeout'
  | 'malformed-response'
  | 'reconciliation-unavailable';

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status?: number;

  constructor(
    code: ServiceErrorCode,
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options);
    this.name = 'ServiceError';
    this.code = code;
    this.status = options?.status;
  }
}
