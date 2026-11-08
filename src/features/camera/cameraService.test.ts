import { describe, expect, it, vi } from 'vitest';

import {
  captureBurst,
  captureJpegFrame,
  requestFrontCamera,
  stopCameraStream,
} from './cameraService';
import { CameraError } from './types';

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { value: HTMLMediaElement.HAVE_CURRENT_DATA },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  });
  return video;
}

describe('requestFrontCamera', () => {
  it('meminta kamera depan tanpa audio', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    await expect(
      requestFrontCamera({
        isSecureContext: true,
        mediaDevices: { getUserMedia },
      }),
    ).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'user' } },
    });
  });

  it('menolak konteks tidak aman sebelum meminta perangkat', async () => {
    const getUserMedia = vi.fn();
    await expect(
      requestFrontCamera({
        isSecureContext: false,
        mediaDevices: { getUserMedia },
      }),
    ).rejects.toMatchObject({ code: 'insecure-context' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotFoundError', 'device-not-found'],
    ['NotReadableError', 'device-busy'],
  ])('memetakan %s menjadi %s', async (name, code) => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('gagal', name));
    await expect(
      requestFrontCamera({
        isSecureContext: true,
        mediaDevices: { getUserMedia },
      }),
    ).rejects.toMatchObject({ code });
  });
});

describe('captureJpegFrame', () => {
  it('menggambar piksel asli tanpa transform mirror', async () => {
    const drawImage = vi.fn();
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback) => callback(blob)),
    } as unknown as HTMLCanvasElement;
    const video = createVideo();

    await expect(captureJpegFrame(video, 0.86, () => canvas)).resolves.toBe(
      blob,
    );
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it('menolak ketika video belum siap', async () => {
    const video = document.createElement('video');
    await expect(captureJpegFrame(video, 0.86)).rejects.toMatchObject({
      code: 'video-not-ready',
    });
  });
});

describe('captureBurst', () => {
  it('mengambil jumlah frame konfigurasi tanpa duplikasi', async () => {
    let currentTime = 0;
    const captureFrame = vi.fn(() => Promise.resolve(new Blob(['frame'])));
    const progress = vi.fn();
    const frames = await captureBurst({
      video: createVideo(),
      config: { frameCount: 3, durationMs: 30, jpegQuality: 0.86 },
      signal: new AbortController().signal,
      captureFrame,
      isVisible: () => true,
      now: () => currentTime,
      wait: (delayMs) => {
        currentTime += delayMs;
        return Promise.resolve();
      },
      onProgress: progress,
    });

    expect(frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
    expect(captureFrame).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenLastCalledWith(3);
  });

  it('membatalkan burst saat tab tersembunyi', async () => {
    let visibleChecks = 0;
    await expect(
      captureBurst({
        video: createVideo(),
        config: { frameCount: 3, durationMs: 0, jpegQuality: 0.86 },
        signal: new AbortController().signal,
        captureFrame: () => Promise.resolve(new Blob(['frame'])),
        isVisible: () => {
          visibleChecks += 1;
          return visibleChecks < 3;
        },
      }),
    ).rejects.toMatchObject({ code: 'capture-interrupted' });
  });

  it('gagal jelas saat burst tidak lengkap dan tidak menggandakan frame', async () => {
    const captureFrame = vi
      .fn()
      .mockResolvedValueOnce(new Blob(['frame']))
      .mockRejectedValueOnce(new Error('sensor gagal'));

    await expect(
      captureBurst({
        video: createVideo(),
        config: { frameCount: 3, durationMs: 0, jpegQuality: 0.86 },
        signal: new AbortController().signal,
        captureFrame,
        isVisible: () => true,
      }),
    ).rejects.toMatchObject({ code: 'capture-incomplete' });
    expect(captureFrame).toHaveBeenCalledTimes(2);
  });
});

describe('stopCameraStream', () => {
  it('menghentikan semua track', () => {
    const stopVideo = vi.fn();
    const stopAudio = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopVideo }, { stop: stopAudio }],
    } as unknown as MediaStream;

    stopCameraStream(stream);

    expect(stopVideo).toHaveBeenCalledOnce();
    expect(stopAudio).toHaveBeenCalledOnce();
  });
});

it('CameraError mempertahankan kode terstruktur', () => {
  expect(new CameraError('device-busy', 'sibuk')).toMatchObject({
    code: 'device-busy',
    message: 'sibuk',
  });
});
