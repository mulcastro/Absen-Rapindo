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

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new Error('Respons server bukan JSON yang valid.', { cause });
  }
}

export async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string'
      ? body.detail
      : 'Permintaan tidak dapat diproses.';
  } catch {
    return 'Permintaan tidak dapat diproses.';
  }
}

export async function csrfHeaders(): Promise<Record<string, string>> {
  const response = await request('/auth/csrf', { method: 'GET' });
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = (await readJson(response)) as { csrf_token?: unknown };
  if (typeof body.csrf_token !== 'string' || !body.csrf_token) {
    throw new Error('Token CSRF dari server tidak valid.');
  }
  return { 'X-CSRF-Token': body.csrf_token };
}
