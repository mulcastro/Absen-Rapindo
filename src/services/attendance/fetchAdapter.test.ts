import { describe, expect, it, vi } from 'vitest';

import { createFetchAttendanceService } from './fetchAdapter';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Fetch attendance adapter', () => {
  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'server'],
  ] as const)('memetakan HTTP %s', async (status, code) => {
    const service = createFetchAttendanceService(
      vi.fn().mockResolvedValue(json({}, status)),
    );
    await expect(service.startAttendance('s-1', 'c-1')).rejects.toMatchObject({
      code,
    });
  });

  it.each([
    ['SESSION_CLOSED', 'session-closed'],
    ['ATTEMPT_EXPIRED', 'attempt-expired'],
  ] as const)('memetakan error server %s', async (serverCode, code) => {
    const service = createFetchAttendanceService(
      vi.fn().mockResolvedValue(json({ error: { code: serverCode } }, 409)),
    );
    await expect(service.startAttendance('s-1', 'c-1')).rejects.toMatchObject({
      code,
    });
  });

  it('menolak JSON malformed pada boundary runtime', async () => {
    const service = createFetchAttendanceService(
      vi.fn().mockResolvedValue(json({ attempt_id: 'tidak-lengkap' })),
    );
    await expect(service.startAttendance('s-1', 'c-1')).rejects.toMatchObject({
      code: 'malformed-response',
    });
  });

  it('membedakan timeout dan network error', async () => {
    const timeout = createFetchAttendanceService(
      vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );
    const network = createFetchAttendanceService(
      vi.fn().mockRejectedValue(new TypeError('offline')),
    );
    await expect(timeout.startAttendance('s-1', 'c-1')).rejects.toMatchObject({
      code: 'timeout',
    });
    await expect(network.startAttendance('s-1', 'c-1')).rejects.toMatchObject({
      code: 'network',
    });
  });

  it('memanggil endpoint rekonsiliasi yang disepakati berdasarkan attempt ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ status: 'processing' }));
    const service = createFetchAttendanceService(fetcher);
    await expect(service.reconcileAttendance('a/1')).resolves.toEqual({
      status: 'unknown',
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/attendance/attempts/a%2F1',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });
});
