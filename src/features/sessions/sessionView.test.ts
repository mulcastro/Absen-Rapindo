import { describe, expect, it } from 'vitest';

import type { DemoSession } from '../visual-demo/types';
import { applyDevelopmentSessionState } from './sessionView';

const session: DemoSession = {
  id: 'fixture',
  title: 'Sesi fixture',
  schedule: 'Jadwal dari fixture',
  locationLabel: 'Lokasi fixture tanpa koordinat',
  status: 'open',
  geoRequired: true,
};

describe('applyDevelopmentSessionState', () => {
  it.each(['closed', 'expired', 'unknown'] as const)(
    'menyediakan state sesi %s tanpa menghitung dari waktu perangkat',
    (status) => {
      expect(
        applyDevelopmentSessionState(session, `?session=${status}`).status,
      ).toBe(status);
    },
  );

  it('menyediakan sesi geo opsional tanpa koordinat venue', () => {
    const result = applyDevelopmentSessionState(session, '?session=optional');
    expect(result.geoRequired).toBe(false);
    expect(result).not.toHaveProperty('latitude');
    expect(result).not.toHaveProperty('longitude');
  });
});
