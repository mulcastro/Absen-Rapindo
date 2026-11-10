import { Link } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import styles from './GeneralPages.module.css';

export function NotFoundPage() {
  return (
    <ParticipantShell>
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Halaman tidak ditemukan</p>
          <h1>Alamat tidak tersedia</h1>
          <p>Periksa kembali alamat yang dibuka.</p>
          <Link to="/">Kembali ke halaman awal</Link>
        </section>
      </main>
    </ParticipantShell>
  );
}
