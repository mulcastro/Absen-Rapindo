import {
  ServiceError,
  type AttendanceAttempt,
  type AttendanceSubmitResult,
  type ConfirmedAttendance,
  type ReconciliationResult,
} from './types';

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw malformed(`${label} bukan object.`);
  }
  return value as Record<string, unknown>;
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw malformed(`Field ${key} tidak valid.`);
  }
  return value;
}

function optionalStringField(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw malformed(`Field ${key} tidak valid.`);
  }
  return value;
}

function positiveInteger(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw malformed(`Field ${key} tidak valid.`);
  }
  return Number(value);
}

function malformed(message: string): ServiceError {
  return new ServiceError(
    'malformed-response',
    'Respons layanan tidak dapat dibaca dengan aman.',
    { cause: new Error(message) },
  );
}

export function parseAttendanceAttempt(value: unknown): AttendanceAttempt {
  const source = record(value, 'Respons start');
  const capture = record(source.capture, 'Capture config');
  return {
    attemptId: stringField(source, 'attempt_id'),
    nonce: stringField(source, 'nonce'),
    expiresAt: stringField(source, 'expires_at'),
    serverTime: stringField(source, 'server_time'),
    capture: {
      frameCount: positiveInteger(capture, 'frame_count'),
      durationMs: positiveInteger(capture, 'duration_ms'),
    },
  };
}

function parseAttendance(value: unknown): ConfirmedAttendance {
  const source = record(value, 'Attendance');
  const status = stringField(source, 'status');
  if (status !== 'hadir' && status !== 'terlambat') {
    throw malformed('Status attendance tidak dikenal.');
  }
  return {
    id: stringField(source, 'id'),
    sessionId: stringField(source, 'session_id'),
    sessionTitle: optionalStringField(source, 'session_title'),
    participantName: stringField(source, 'participant_name'),
    status,
    markedAt: stringField(source, 'marked_at'),
  };
}

export function parseAttendanceResult(value: unknown): AttendanceSubmitResult {
  const source = record(value, 'Respons submit');
  const outcome = stringField(source, 'outcome');
  const requestId = stringField(source, 'request_id');
  if (outcome === 'accepted' || outcome === 'already_recorded') {
    return {
      outcome,
      attendance: parseAttendance(source.attendance),
      requestId,
    };
  }
  if (outcome === 'rejected') {
    return {
      outcome,
      category: stringField(source, 'category'),
      message: stringField(source, 'message'),
      requestId,
    };
  }
  throw malformed('Outcome tidak dikenal.');
}

export function parseReconciliationResult(
  value: unknown,
): ReconciliationResult {
  const source = record(value, 'Respons rekonsiliasi');
  const status = stringField(source, 'status');
  if (status === 'processing' || status === 'not_found') {
    return { status: 'unknown' };
  }
  if (
    status === 'accepted' ||
    status === 'already_recorded' ||
    status === 'rejected'
  ) {
    return {
      status: 'confirmed',
      result: parseAttendanceResult({ ...source, outcome: status }),
    };
  }
  throw malformed('Status rekonsiliasi tidak dikenal.');
}
