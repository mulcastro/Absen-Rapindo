import { describe, expect, it } from 'vitest';

import { createMockIdentityService } from './identityService';

describe('fixture pengujian kontrak identitas', () => {
  it('mengembalikan role login sesuai pintu masuk dan restore tidak mengarang sesi', async () => {
    const service = createMockIdentityService();
    await expect(
      service.login({
        identifier: 'P-001',
        secret: '012345',
        role: 'participant',
      }),
    ).resolves.toMatchObject({ role: 'participant' });
    await expect(
      service.login({
        identifier: 'admin',
        secret: 'x',
        totp: '012345',
        role: 'admin',
      }),
    ).resolves.toMatchObject({ role: 'admin' });
    await expect(service.restore()).resolves.toBeNull();
    await expect(service.logout()).resolves.toBeUndefined();
  });

  it('challenge berasal dari service dengan urutan dan expiry tetap', async () => {
    const service = createMockIdentityService();
    const challenge = await service.createChallenge(
      'valid',
      'draft-simulasi-v1',
    );
    expect(challenge.orderedSteps).toEqual(['lurus', 'kanan']);
    expect(challenge.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    expect(challenge.capture).toEqual({ frameCount: 16, durationMs: 4_000 });
  });

  it.each(['expired', 'used', 'duplicate', 'rejected'] as const)(
    'menyediakan state undangan %s',
    async (status) => {
      const service = createMockIdentityService();
      await expect(service.getInvite(status)).resolves.toMatchObject({
        status,
      });
    },
  );

  it('menyiapkan hasil challenge expired tanpa memperpanjang expiry lokal', async () => {
    const service = createMockIdentityService();
    await expect(
      service.submitEnrollment({
        token: 'challenge-expired',
        challengeId: 'challenge-simulasi-001',
        nonce: 'nonce-simulasi-001',
        consentVersion: 'draft-simulasi-v1',
        consentAccepted: true,
        pin: '012345',
        frames: [],
      }),
    ).resolves.toMatchObject({ status: 'expired' });
  });
});
