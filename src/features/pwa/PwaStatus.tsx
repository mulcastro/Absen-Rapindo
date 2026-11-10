import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

import styles from './PwaStatus.module.css';

export function PwaStatus() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    registerSW({
      immediate: false,
      onOfflineReady: () => setOfflineReady(true),
      onNeedRefresh: () => setUpdateReady(true),
    });
  }, []);

  if (!offlineReady && !updateReady) return null;

  return (
    <aside className={styles.notice} role="status" aria-live="polite">
      <strong>
        {updateReady
          ? 'Pembaruan tersedia'
          : 'Aplikasi siap dibuka kembali tanpa jaringan'}
      </strong>
      <p>
        {updateReady
          ? 'Selesaikan pengambilan atau pengiriman absensi, lalu tutup dan buka kembali aplikasi. Halaman tidak akan dimuat ulang otomatis.'
          : 'Hanya kerangka dan aset publik yang tersedia offline. Absensi, login, data, dan pengiriman tetap memerlukan jaringan.'}
      </p>
      <button
        type="button"
        onClick={() => {
          setOfflineReady(false);
          setUpdateReady(false);
        }}
      >
        Tutup pemberitahuan
      </button>
    </aside>
  );
}
