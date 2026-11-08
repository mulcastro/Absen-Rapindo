import { describe, expect, it } from 'vitest';

import {
  parseAttendanceAttempt,
  parseAttendanceResult,
  parseReconciliationResult,
} from './parsers';

describe('attendance runtime parsers', () => {
  it('memvalidasi attempt dan capture config', () => {
    expect(
      parseAttendanceAttempt({
        attempt_id: 'a-1',
        nonce: 'n-1',
        expires_at: '2026-11-08T01:00:00Z',
        server_time: '2026-11-08T00:59:00Z',
        capture: { frame_count: 12, duration_ms: 1500 },
      }),
    ).toMatchObject({ attemptId: 'a-1', capture: { frameCount: 12 } });
  });

  it('menolak respons malformed dan enum asing', () => {
    expect(() => parseAttendanceAttempt({ attempt_id: 'a-1' })).toThrowError();
    expect(() =>
      parseAttendanceResult({ outcome: 'maybe', request_id: 'r-1' }),
    ).toThrowError();
  });

  it('menerima already_recorded sebagai hasil backend terkonfirmasi', () => {
    expect(
      parseAttendanceResult({
        outcome: 'already_recorded',
        request_id: 'r-1',
        attendance: {
          id: 'at-1',
          session_id: 's-1',
          participant_name: 'Peserta',
          status: 'hadir',
          marked_at: '2026-11-08T01:00:00Z',
        },
      }).outcome,
    ).toBe('already_recorded');
  });

  it('memetakan rekonsiliasi processing ke unknown', () => {
    expect(parseReconciliationResult({ status: 'processing' })).toEqual({
      status: 'unknown',
    });
  });

  it('memvalidasi hasil accepted dari endpoint rekonsiliasi', () => {
    expect(
      parseReconciliationResult({
        status: 'accepted',
        request_id: 'r-1',
        attendance: {
          id: 'at-1',
          session_id: 's-1',
          participant_name: 'Peserta',
          status: 'hadir',
          marked_at: '2026-11-08T01:00:00Z',
        },
      }),
    ).toMatchObject({ status: 'confirmed', result: { outcome: 'accepted' } });
  });
});
