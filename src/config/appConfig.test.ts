import { describe, expect, it } from 'vitest';

import { createAppConfig } from './appConfig';

describe('createAppConfig', () => {
  it('menggunakan API satu-origin sebagai nilai awal', () => {
    expect(createAppConfig({})).toEqual({ apiBaseUrl: '/api' });
  });

  it('menerima path relatif dan URL HTTPS', () => {
    expect(createAppConfig({ VITE_API_BASE_URL: '/layanan/' })).toEqual({
      apiBaseUrl: '/layanan',
    });
    expect(
      createAppConfig({ VITE_API_BASE_URL: 'https://contoh.test/api/' }),
    ).toEqual({ apiBaseUrl: 'https://contoh.test/api' });
  });

  it('menolak URL HTTP', () => {
    expect(() =>
      createAppConfig({ VITE_API_BASE_URL: 'http://contoh.test/api' }),
    ).toThrow('URL HTTPS');
  });
});
