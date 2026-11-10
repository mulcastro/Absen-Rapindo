export interface AppConfig {
  apiBaseUrl: string;
}

interface PublicEnv {
  VITE_API_BASE_URL?: string;
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
  return Object.freeze({
    apiBaseUrl: parseApiBaseUrl(env.VITE_API_BASE_URL),
  });
}

export const appConfig = createAppConfig(import.meta.env);
