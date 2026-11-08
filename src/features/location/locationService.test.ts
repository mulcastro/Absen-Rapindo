import { describe, expect, it, vi } from 'vitest';

import { requestLocation } from './locationService';

function position(latitude: number, longitude: number, accuracy: number) {
  return {
    coords: { latitude, longitude, accuracy },
  } as GeolocationPosition;
}

function createEnvironment() {
  let success: PositionCallback = () => undefined;
  let failure: PositionErrorCallback = () => undefined;
  let timeoutCallback: () => void = () => undefined;
  const clearWatch = vi.fn();
  const clearTimer = vi.fn();
  const geolocation = {
    watchPosition: vi.fn(
      (
        onSuccess: PositionCallback,
        onFailure?: PositionErrorCallback | null,
      ) => {
        success = onSuccess;
        failure = onFailure ?? (() => undefined);
        return 17;
      },
    ),
    clearWatch,
  } as Pick<Geolocation, 'watchPosition' | 'clearWatch'>;

  return {
    environment: {
      geolocation,
      now: () => new Date('2026-11-08T05:00:00.000Z'),
      setTimer: ((callback: TimerHandler) => {
        timeoutCallback = callback as () => void;
        return 23;
      }) as typeof window.setTimeout,
      clearTimer: clearTimer as typeof window.clearTimeout,
    },
    clearWatch,
    clearTimer,
    succeed: (value: GeolocationPosition) => success(value),
    fail: (code: number) => failure({ code } as GeolocationPositionError),
    timeout: () => timeoutCallback(),
  };
}

describe('requestLocation', () => {
  it('mengambil koordinat, accuracy, dan captured_at lalu membersihkan watcher', async () => {
    const context = createEnvironment();
    const request = requestLocation(5_000, context.environment);
    context.succeed(position(-6.2, 106.8, 18));

    await expect(request.promise).resolves.toEqual({
      latitude: -6.2,
      longitude: 106.8,
      accuracy: 18,
      capturedAt: '2026-11-08T05:00:00.000Z',
    });
    expect(context.clearWatch).toHaveBeenCalledWith(17);
    expect(context.clearTimer).toHaveBeenCalledWith(23);
  });

  it('mempertahankan accuracy buruk tanpa mengklaim lokasi terverifikasi', async () => {
    const context = createEnvironment();
    const request = requestLocation(5_000, context.environment);
    context.succeed(position(-6.2, 106.8, 450));

    await expect(request.promise).resolves.toMatchObject({ accuracy: 450 });
  });

  it('memetakan izin ditolak dan membersihkan watcher', async () => {
    const context = createEnvironment();
    const request = requestLocation(5_000, context.environment);
    context.fail(1);

    await expect(request.promise).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(context.clearWatch).toHaveBeenCalledWith(17);
  });

  it('menghentikan watcher saat timeout lokal', async () => {
    const context = createEnvironment();
    const request = requestLocation(5_000, context.environment);
    context.timeout();

    await expect(request.promise).rejects.toMatchObject({ code: 'timeout' });
    expect(context.clearWatch).toHaveBeenCalledWith(17);
  });

  it('cancel membersihkan watcher saat navigasi atau perubahan sesi', async () => {
    const context = createEnvironment();
    const request = requestLocation(5_000, context.environment);
    request.cancel();

    await expect(request.promise).rejects.toMatchObject({ code: 'unknown' });
    expect(context.clearWatch).toHaveBeenCalledWith(17);
    expect(context.clearTimer).toHaveBeenCalledWith(23);
  });
});
