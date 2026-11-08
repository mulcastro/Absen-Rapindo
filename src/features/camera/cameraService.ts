import { validateBurstConfig } from '../../services/captureConfig';
import { CameraError, type BurstConfig, type CapturedFrame } from './types';

interface CameraEnvironment {
  isSecureContext: boolean;
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
}

function currentEnvironment(): CameraEnvironment {
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
  };
}

export function mapMediaError(error: unknown): CameraError {
  if (error instanceof CameraError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return new CameraError(
        'permission-denied',
        'Izin kamera ditolak. Izinkan kamera depan melalui pengaturan browser lalu coba lagi.',
        { cause: error },
      );
    }
    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return new CameraError(
        'device-not-found',
        'Kamera depan tidak ditemukan pada perangkat ini.',
        { cause: error },
      );
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return new CameraError(
        'device-busy',
        'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.',
        { cause: error },
      );
    }
  }

  return new CameraError(
    'capture-failed',
    'Kamera tidak dapat digunakan. Coba lagi atau periksa pengaturan perangkat.',
    { cause: error },
  );
}

export async function requestFrontCamera(
  environment: CameraEnvironment = currentEnvironment(),
): Promise<MediaStream> {
  if (!environment.isSecureContext) {
    throw new CameraError(
      'insecure-context',
      'Kamera memerlukan koneksi HTTPS yang tepercaya.',
    );
  }
  if (!environment.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'unsupported',
      'Browser ini tidak mendukung akses kamera.',
    );
  }

  try {
    return await environment.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
      },
    });
  } catch (error) {
    throw mapMediaError(error);
  }
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

type CanvasFactory = () => HTMLCanvasElement;

export async function captureJpegFrame(
  video: HTMLVideoElement,
  jpegQuality: number,
  createCanvas: CanvasFactory = () => document.createElement('canvas'),
): Promise<Blob> {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth < 1 ||
    video.videoHeight < 1
  ) {
    throw new CameraError(
      'video-not-ready',
      'Video belum siap. Tunggu pratinjau kamera lalu coba lagi.',
    );
  }

  const canvas = createCanvas();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new CameraError(
      'capture-failed',
      'Frame kamera tidak dapat diproses.',
    );
  }

  // Tidak ada translate/scale: piksel JPEG tidak mirror walau preview di-mirror CSS.
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(
            new CameraError(
              'capture-failed',
              'Frame JPEG tidak berhasil dibuat.',
            ),
          );
        }
      },
      'image/jpeg',
      jpegQuality,
    );
  });
}

interface CaptureBurstOptions {
  video: HTMLVideoElement;
  config: BurstConfig;
  signal: AbortSignal;
  captureFrame?: (video: HTMLVideoElement, quality: number) => Promise<Blob>;
  isVisible?: () => boolean;
  now?: () => number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onProgress?: (capturedCount: number) => void;
}

function waitWithAbort(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(
        new CameraError(
          'capture-interrupted',
          'Pengambilan gambar dibatalkan.',
        ),
      );
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(
        new CameraError(
          'capture-interrupted',
          'Pengambilan gambar dibatalkan.',
        ),
      );
    };
    const timer = window.setTimeout(
      () => {
        signal.removeEventListener('abort', handleAbort);
        resolve();
      },
      Math.max(0, delayMs),
    );
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function captureBurst({
  video,
  config: rawConfig,
  signal,
  captureFrame = captureJpegFrame,
  isVisible = () => document.visibilityState === 'visible',
  now = () => performance.now(),
  wait = waitWithAbort,
  onProgress,
}: CaptureBurstOptions): Promise<CapturedFrame[]> {
  const config = validateBurstConfig(rawConfig);
  const startedAt = now();
  const intervalMs =
    config.frameCount > 1 ? config.durationMs / (config.frameCount - 1) : 0;
  const frames: CapturedFrame[] = [];

  for (let index = 0; index < config.frameCount; index += 1) {
    if (signal.aborted || !isVisible()) {
      throw new CameraError(
        'capture-interrupted',
        'Pengambilan gambar dibatalkan karena tab tidak aktif.',
      );
    }

    const targetElapsed = intervalMs * index;
    const remainingDelay = targetElapsed - (now() - startedAt);
    if (remainingDelay > 0) {
      await wait(remainingDelay, signal);
    }

    if (signal.aborted || !isVisible()) {
      throw new CameraError(
        'capture-interrupted',
        'Pengambilan gambar dibatalkan karena tab tidak aktif.',
      );
    }

    try {
      const blob = await captureFrame(video, config.jpegQuality);
      frames.push({
        index,
        blob,
        capturedAt: new Date().toISOString(),
        elapsedMs: Math.round(now() - startedAt),
      });
      onProgress?.(frames.length);
    } catch (error) {
      if (error instanceof CameraError) {
        throw error;
      }
      throw new CameraError(
        'capture-incomplete',
        `Burst tidak lengkap: ${frames.length} dari ${config.frameCount} frame diambil.`,
        { cause: error },
      );
    }
  }

  if (frames.length !== config.frameCount) {
    throw new CameraError(
      'capture-incomplete',
      `Burst tidak lengkap: ${frames.length} dari ${config.frameCount} frame diambil.`,
    );
  }

  return frames;
}
