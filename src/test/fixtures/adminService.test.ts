import { describe, expect, it } from 'vitest';

import { createMockAdminService } from './adminService';

describe('fixture pengujian service admin', () => {
  it('membuka dan menutup sesi tanpa mengarang koordinat', async () => {
    const service = createMockAdminService();
    const created = await service.createSession({
      title: 'Sesi uji',
      startsAt: '2026-11-12T08:00',
      endsAt: '2026-11-12T09:00',
      lateAfterMinutes: 10,
      geoRequired: false,
      geoCenter: null,
      geoRadiusMeters: null,
      geoAccuracyMeters: null,
    });
    expect(created.geoCenter).toBeNull();
    expect((await service.openSession(created.id)).status).toBe('open');
    expect((await service.closeSession(created.id)).status).toBe('closed');
  });

  it('memisahkan kehadiran sah dari percobaan gagal sesudah hadir', async () => {
    const recap = await createMockAdminService().getRecap('sesi-contoh');
    const ayu = recap.roster.find((row) => row.participantId === 'p-001');
    expect(ayu?.attendance?.status).toBe('hadir');
    expect(ayu?.latestFailedAttempt).not.toBeNull();
  });

  it('menolak akses 403 dan menyelesaikan ekspor fixture test', async () => {
    const service = createMockAdminService();
    await expect(service.getRecap('forbidden')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      service.requestExport('sesi-contoh', 'xlsx'),
    ).resolves.toBeUndefined();
  });
});
