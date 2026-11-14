import type { RefObject } from 'react';

import type { CameraState } from './types';
import styles from './CameraPanel.module.css';

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
  instruction?: string;
}

export function CameraPanel({
  videoRef,
  state,
  instruction,
}: CameraPanelProps) {
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
        {instruction ??
          (state.status === 'idle' &&
            'Aktifkan kamera untuk melihat pratinjau')}
        {instruction === undefined &&
          state.status === 'requesting' &&
          'Menyiapkan kamera…'}
        {instruction === undefined &&
          state.status === 'ready' &&
          'Posisikan wajah di dalam bingkai'}
        {instruction === undefined &&
          state.status === 'capturing' &&
          'Tetap diam, gambar sedang diambil…'}
        {instruction === undefined &&
          state.status === 'captured' &&
          'Pengambilan gambar selesai'}
        {instruction === undefined &&
          state.status === 'error' &&
          'Kamera belum dapat digunakan'}
      </p>
    </section>
  );
}
