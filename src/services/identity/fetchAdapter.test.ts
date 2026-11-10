import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CapturedFrame } from '../../features/camera/types';
import { createFetchIdentityService } from './fetchAdapter';

function frame(index: number, value: string): CapturedFrame {
  return {
    index,
    blob: new Blob([value], { type: 'image/jpeg' }),
    capturedAt: '2026-11-08T12:00:00.000Z',
    elapsedMs: index * 100,
  };
}

describe('Fetch identity adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mempertahankan label consent draf dari server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'valid',
            participant_name: 'Peserta Uji',
            purpose: 'enroll',
            consent: {
              version: 'draft-development-v1',
              text: 'Draf pengujian.',
              draft: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      createFetchIdentityService().getInvite('token'),
    ).resolves.toMatchObject({
      consent: { draft: true },
    });
  });

  it('mengirim TOTP admin bersama kredensial tanpa menyimpannya', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ display_name: 'admin', role: 'admin' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    await createFetchIdentityService().login({
      identifier: 'admin',
      secret: 'kata-sandi',
      role: 'admin',
      totp: '012345',
    });

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: 'admin',
      password: 'kata-sandi',
      totp: '012345',
    });
  });

  it('mengirim burst wajah lama terpisah saat reenrollment', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'enrolled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);

    const service = createFetchIdentityService();
    await expect(
      service.submitEnrollment({
        token: 'token/reenroll',
        challengeId: 'challenge-1',
        nonce: 'nonce-1',
        consentVersion: 'v1',
        consentAccepted: true,
        pin: '012345',
        frames: [frame(0, 'baru-1'), frame(1, 'baru-2')],
        oldFaceFrames: [frame(0, 'lama-1')],
      }),
    ).resolves.toEqual({ status: 'enrolled' });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/enroll/token%2Freenroll/submit');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.getAll('frames')).toHaveLength(2);
    expect(form.getAll('old_face_frames')).toHaveLength(1);
    expect(form.get('pin')).toBe('012345');
  });
});
