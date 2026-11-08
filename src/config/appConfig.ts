export type DataSource = 'api' | 'mock';

export interface AppConfig {
  apiBaseUrl: string;
  dataSource: DataSource;
}

interface PublicEnv {
  VITE_API_BASE_URL?: string;
  VITE_DATA_SOURCE?: string;
  DEV?: boolean;
  PROD?: boolean;
}

function parseDataSource(
  value: string | undefined,
  defaultSource: DataSource,
): DataSource {
  const dataSource = value ?? defaultSource;

  if (dataSource !== 'api' && dataSource !== 'mock') {
    throw new Error('VITE_DATA_SOURCE harus bernilai api atau mock.');
  }

  return dataSource;
}

function parseApiBaseUrl(value: string | undefined): string {
  const apiBaseUrl = value?.trim() || '/api';

  if (!apiBaseUrl.startsWith('/') && !apiBaseUrl.startsWith('https://')) {
    throw new Error(
      'VITE_API_BASE_URL harus berupa path relatif atau URL HTTPS.',
    );
  }

  return apiBaseUrl.replace(/\/$/, '');
}

export function createAppConfig(env: PublicEnv): AppConfig {
  const dataSource = parseDataSource(
    env.VITE_DATA_SOURCE,
    env.DEV ? 'mock' : 'api',
  );

  if (env.PROD && dataSource === 'mock') {
    throw new Error('Mode mock tidak diizinkan pada build produksi.');
  }

  return Object.freeze({
    apiBaseUrl: parseApiBaseUrl(env.VITE_API_BASE_URL),
    dataSource,
  });
}

export const appConfig = createAppConfig(import.meta.env);
