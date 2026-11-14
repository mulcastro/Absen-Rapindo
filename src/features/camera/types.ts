export type CameraErrorCode =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'device-not-found'
  | 'device-busy'
  | 'stream-ended'
  | 'video-not-ready'
  | 'capture-interrupted'
  | 'capture-incomplete'
  | 'capture-failed';

export class CameraError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CameraError';
  }
}

export interface BurstConfig {
  frameCount: number;
  durationMs: number;
  jpegQuality: number;
  onProgress?: (capturedCount: number) => void;
}

export interface CapturedFrame {
  index: number;
  blob: Blob;
  capturedAt: string;
  elapsedMs: number;
}

export type CameraStatus =
  'idle' | 'requesting' | 'ready' | 'capturing' | 'captured' | 'error';

export interface CameraState {
  status: CameraStatus;
  error: CameraError | null;
  capturedCount: number;
  targetCount: number;
}
