import { useNavigate } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Button } from '../components/ui/Button';
import styles from './GeneralPages.module.css';

export function InstallPage() {
  const navigate = useNavigate();
  return (
    <ParticipantShell title="Pasang aplikasi">
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Petunjuk pemasangan</p>
          <h1>Pasang Absensi LPK Rapindo</h1>
          <h2>Android (Chrome)</h2>
          <ol>
            <li>Buka menu tiga titik pada browser.</li>
            <li>
              Pilih “Instal aplikasi” atau “Tambahkan ke layar utama” jika
              tersedia.
            </li>
            <li>Konfirmasi pemasangan.</li>
          </ol>
          <h2>iPhone/iPad (Safari)</h2>
          <ol>
            <li>Ketuk tombol Bagikan.</li>
            <li>Pilih “Tambahkan ke Layar Utama”.</li>
            <li>Periksa nama aplikasi, lalu ketuk Tambah.</li>
          </ol>
          <p>
            Menu pemasangan bergantung pada browser dan perangkat. Aplikasi
            tidak menganggap prompt pemasangan otomatis selalu tersedia.
          </p>
          <p>
            Anda tetap memerlukan koneksi internet untuk masuk, melihat sesi,
            dan melakukan absensi.
          </p>
          <Button variant="outline" onClick={() => void navigate('/masuk')}>
            Kembali ke halaman masuk
          </Button>
        </section>
      </main>
    </ParticipantShell>
  );
}
