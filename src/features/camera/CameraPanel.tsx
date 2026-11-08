import type { RefObject } from 'react';

import type { CameraState } from './types';
import styles from './CameraPanel.module.css';

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
}

export function CameraPanel({ videoRef, state }: CameraPanelProps) {
  const hasPreview =
    state.status === 'ready' ||
    state.status === 'capturing' ||
    state.status === 'captured';

  return (
    <section className={styles.panel} aria-label="Pratinjau kamera depan">
      <video
        ref={videoRef}
        className={`${styles.video} ${hasPreview ? styles.visible : ''}`}
        autoPlay
        muted
        playsInline
        aria-label="Video kamera depan"
      />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.faceGuide} aria-hidden="true" />
      <p className={styles.instruction}>
        {state.status === 'idle' && 'Kamera belum diaktifkan'}
        {state.status === 'requesting' && 'Meminta izin kamera…'}
        {state.status === 'ready' && 'Posisikan wajah di dalam bingkai'}
        {state.status === 'capturing' &&
          `Mengambil gambar ${state.capturedCount}/${state.targetCount}…`}
        {state.status === 'captured' &&
          `${state.capturedCount} frame siap di memori sesi`}
        {state.status === 'error' && 'Kamera memerlukan perhatian'}
      </p>
    </section>
  );
}
