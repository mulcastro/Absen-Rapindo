import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ServiceError,
  type AttendanceService,
} from '../../services/attendance';
import { useAttendanceFlow } from './useAttendanceFlow';

const attempt = {
  attemptId: 'a-1',
  nonce: 'n-1',
  expiresAt: '2099-01-01T00:00:00Z',
  serverTime: '2026-11-08T00:00:00Z',
  capture: { frameCount: 1, durationMs: 1 },
};
const frame = {
  index: 0,
  blob: new Blob(['jpeg']),
  capturedAt: '2026-11-08T00:00:00Z',
  elapsedMs: 0,
};

function service(
  overrides: Partial<AttendanceService> = {},
): AttendanceService {
  return {
    listActiveSessions: vi.fn().mockResolvedValue([]),
    startAttendance: vi.fn().mockResolvedValue(attempt),
    submitAttendance: vi.fn().mockResolvedValue({
      outcome: 'accepted',
      requestId: 'r-1',
      attendance: {
        id: 'at-1',
        sessionId: 's-1',
        participantName: 'Peserta',
        status: 'hadir',
        markedAt: '2026-11-08T00:00:00Z',
      },
    }),
    reconcileAttendance: vi.fn(),
    ...overrides,
  };
}

describe('useAttendanceFlow', () => {
  it('menjalankan ready -> start -> capture -> submit dan mencegah submit ganda', async () => {
    const startAttendance = vi.fn().mockResolvedValue(attempt);
    const submitAttendance = vi.fn().mockResolvedValue({
      outcome: 'accepted',
      requestId: 'r-1',
      attendance: {
        id: 'at-1',
        sessionId: 's-1',
        participantName: 'Peserta',
        status: 'hadir',
        markedAt: '2026-11-08T00:00:00Z',
      },
    });
    const adapter = service({ startAttendance, submitAttendance });
    const loader = vi.fn().mockResolvedValue(adapter);
    const capture = vi.fn().mockResolvedValue([frame]);
    const confirmed = vi.fn();
    const { result } = renderHook(() => useAttendanceFlow('s-1', loader));
    act(() => result.current.markReady());
    await act(async () => {
      const options = {
        sessionId: 's-1',
        location: null,
        capture,
        onConfirmed: confirmed,
      };
      await Promise.all([
        result.current.run(options),
        result.current.run(options),
      ]);
    });
    expect(startAttendance).toHaveBeenCalledOnce();
    expect(submitAttendance).toHaveBeenCalledOnce();
    expect(confirmed).toHaveBeenCalledWith('a-1');
    expect(result.current.state.phase).toBe('accepted');
  });

  it.each(['network', 'timeout'] as const)(
    'menjadi unknown untuk %s setelah submit dan tidak mengirim ulang',
    async (code) => {
      const submitAttendance = vi
        .fn()
        .mockRejectedValue(new ServiceError(code, 'hasil tidak pasti'));
      const adapter = service({ submitAttendance });
      const loader = () => Promise.resolve(adapter);
      const { result } = renderHook(() => useAttendanceFlow('s-1', loader));
      act(() => result.current.markReady());
      await act(() =>
        result.current.run({
          sessionId: 's-1',
          location: null,
          capture: () => Promise.resolve([frame]),
          onConfirmed: vi.fn(),
        }),
      );
      expect(result.current.state.phase).toBe('unknown');
      expect(result.current.state.message).toMatch(/Jangan mengirim ulang/);
      expect(submitAttendance).toHaveBeenCalledOnce();
    },
  );

  it('memulihkan hasil unknown tanpa mengirim ulang absensi', async () => {
    const submitAttendance = vi
      .fn()
      .mockRejectedValue(new ServiceError('network', 'Koneksi terputus.'));
    const recoveredResult = {
      outcome: 'accepted' as const,
      requestId: 'r-1',
      attendance: {
        id: 'at-1',
        sessionId: 's-1',
        participantName: 'Peserta',
        status: 'hadir' as const,
        markedAt: '2026-11-08T00:00:00Z',
      },
    };
    const reconcileAttendance = vi.fn().mockResolvedValue({
      status: 'confirmed',
      result: recoveredResult,
    });
    const adapter = service({ submitAttendance, reconcileAttendance });
    const loader = () => Promise.resolve(adapter);
    const confirmed = vi.fn();
    const { result } = renderHook(() => useAttendanceFlow('s-1', loader));
    act(() => result.current.markReady());
    await act(() =>
      result.current.run({
        sessionId: 's-1',
        location: null,
        capture: () => Promise.resolve([frame]),
        onConfirmed: confirmed,
      }),
    );
    await act(() => result.current.recover(confirmed));

    expect(reconcileAttendance).toHaveBeenCalledWith('a-1');
    expect(submitAttendance).toHaveBeenCalledOnce();
    expect(confirmed).toHaveBeenCalledWith('a-1');
    expect(result.current.state.phase).toBe('accepted');
  });

  it('menolak nonce expired sebelum capture', async () => {
    const adapter = service({
      startAttendance: vi
        .fn()
        .mockRejectedValue(
          new ServiceError('attempt-expired', 'Percobaan kedaluwarsa.'),
        ),
    });
    const capture = vi.fn();
    const loader = () => Promise.resolve(adapter);
    const { result } = renderHook(() => useAttendanceFlow('s-1', loader));
    act(() => result.current.markReady());
    await act(() =>
      result.current.run({
        sessionId: 's-1',
        location: null,
        capture,
        onConfirmed: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe('rejected'));
    expect(capture).not.toHaveBeenCalled();
  });
});
