import type { BurstConfig } from '../features/camera/types';

// Default dokumentasi untuk UX/capture. Bukan threshold PAD, match, atau keamanan.
export const ATTENDANCE_BURST_DEFAULT: Readonly<BurstConfig> = Object.freeze({
  frameCount: 12,
  durationMs: 1_500,
  jpegQuality: 0.86,
});

export const ENROLLMENT_BURST_DEFAULT: Readonly<BurstConfig> = Object.freeze({
  frameCount: 16,
  durationMs: 4_000,
  jpegQuality: 0.86,
});

export function validateBurstConfig(config: BurstConfig): BurstConfig {
  if (!Number.isInteger(config.frameCount) || config.frameCount < 1) {
    throw new Error('Jumlah frame harus berupa bilangan bulat positif.');
  }
  if (!Number.isFinite(config.durationMs) || config.durationMs < 0) {
    throw new Error('Durasi burst tidak valid.');
  }
  if (
    !Number.isFinite(config.jpegQuality) ||
    config.jpegQuality <= 0 ||
    config.jpegQuality > 1
  ) {
    throw new Error('Kualitas JPEG harus lebih dari 0 sampai 1.');
  }

  return { ...config };
}
