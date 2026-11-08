import { LocationError, type LocationCapture } from './types';

interface LocationEnvironment {
  geolocation?: Pick<Geolocation, 'watchPosition' | 'clearWatch'>;
  now?: () => Date;
  setTimer?: typeof window.setTimeout;
  clearTimer?: typeof window.clearTimeout;
}

export interface LocationRequest {
  promise: Promise<LocationCapture>;
  cancel: () => void;
}

export function mapLocationError(error: unknown): LocationError {
  if (error instanceof LocationError) return error;
  if (typeof error === 'object' && error && 'code' in error) {
    const code = Number(error.code);
    if (code === 1) {
      return new LocationError(
        'permission-denied',
        'Izin lokasi ditolak. Izinkan lokasi melalui pengaturan browser lalu coba lagi.',
        { cause: error },
      );
    }
    if (code === 2) {
      return new LocationError(
        'position-unavailable',
        'Lokasi belum tersedia. Aktifkan layanan lokasi dan coba lagi.',
        { cause: error },
      );
    }
    if (code === 3) {
      return new LocationError(
        'timeout',
        'Pengambilan lokasi melewati batas waktu. Coba lagi di tempat yang lebih terbuka.',
        { cause: error },
      );
    }
  }
  return new LocationError(
    'unknown',
    'Lokasi tidak dapat diambil. Coba lagi.',
    {
      cause: error,
    },
  );
}

export function requestLocation(
  timeoutMs = 12_000,
  environment: LocationEnvironment = {},
): LocationRequest {
  const geolocation = environment.geolocation ?? navigator.geolocation;
  if (!geolocation?.watchPosition) {
    const error = new LocationError(
      'unsupported',
      'Browser ini tidak mendukung pengambilan lokasi.',
    );
    return { promise: Promise.reject(error), cancel: () => undefined };
  }

  const now = environment.now ?? (() => new Date());
  const setTimer = environment.setTimer ?? window.setTimeout.bind(window);
  const clearTimer = environment.clearTimer ?? window.clearTimeout.bind(window);
  let watchId: number | null = null;
  let timerId: number | null = null;
  let settled = false;
  let rejectRequest: ((reason: LocationError) => void) | null = null;

  const cleanup = () => {
    if (watchId !== null) geolocation.clearWatch(watchId);
    if (timerId !== null) clearTimer(timerId);
    watchId = null;
    timerId = null;
  };

  const promise = new Promise<LocationCapture>((resolve, reject) => {
    rejectRequest = reject;
    watchId = geolocation.watchPosition(
      (position) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: now().toISOString(),
        });
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(mapLocationError(error));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
    timerId = setTimer(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new LocationError(
          'timeout',
          'Pengambilan lokasi melewati batas waktu. Coba lagi di tempat yang lebih terbuka.',
        ),
      );
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectRequest?.(
        new LocationError('unknown', 'Pengambilan lokasi dibatalkan.'),
      );
    },
  };
}
