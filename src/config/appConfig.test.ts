import { describe, expect, it } from 'vitest';

import { createAppConfig } from './appConfig';

describe('createAppConfig', () => {
  it('menggunakan konfigurasi API aman sebagai nilai awal', () => {
    expect(createAppConfig({})).toEqual({
      apiBaseUrl: '/api',
      dataSource: 'api',
    });
  });

  it('menggunakan mock sebagai nilai awal khusus development', () => {
    expect(createAppConfig({ DEV: true, PROD: false })).toEqual({
      apiBaseUrl: '/api',
      dataSource: 'mock',
    });
  });

  it('mengizinkan mock hanya ketika bukan produksi', () => {
    expect(createAppConfig({ VITE_DATA_SOURCE: 'mock', PROD: false })).toEqual({
      apiBaseUrl: '/api',
      dataSource: 'mock',
    });
    expect(() =>
      createAppConfig({ VITE_DATA_SOURCE: 'mock', PROD: true }),
    ).toThrow('Mode mock tidak diizinkan');
  });

  it('menolak sumber data dan URL publik yang tidak valid', () => {
    expect(() => createAppConfig({ VITE_DATA_SOURCE: 'fixture' })).toThrow(
      'VITE_DATA_SOURCE',
    );
    expect(() =>
      createAppConfig({ VITE_API_BASE_URL: 'http://contoh.test/api' }),
    ).toThrow('URL HTTPS');
  });
});
