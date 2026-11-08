import { appConfig } from '../config/appConfig';

export async function request(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/')) {
    throw new Error('Path layanan harus diawali garis miring.');
  }

  return fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
    signal: init.signal,
  });
}
