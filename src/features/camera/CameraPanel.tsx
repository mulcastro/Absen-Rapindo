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
        {state.status === 'idle' && 'Aktifkan kamera untuk melihat pratinjau'}
        {state.status === 'requesting' && 'Menyiapkan kamera…'}
        {state.status === 'ready' && 'Posisikan wajah di dalam bingkai'}
        {state.status === 'capturing' && 'Tetap diam, gambar sedang diambil…'}
        {state.status === 'captured' && 'Pengambilan gambar selesai'}
        {state.status === 'error' && 'Kamera belum dapat digunakan'}
      </p>
    </section>
  );
}
