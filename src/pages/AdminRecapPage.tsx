import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { AdminShell } from '../components/layout/AdminShell';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import type { RecapStatus } from '../features/visual-demo/types';
import {
  getVisualState,
  useVisualDemo,
} from '../features/visual-demo/useVisualDemo';
import styles from './ReferenceScreens.module.css';

const STATUS_LABELS: Record<RecapStatus, string> = {
  hadir: 'Hadir',
  terlambat: 'Terlambat',
  gagal: 'Gagal',
  belum: 'Belum',
};

const STATUS_TONES: Record<RecapStatus, BadgeTone> = {
  hadir: 'success',
  terlambat: 'warning',
  gagal: 'failure',
  belum: 'neutral',
};

export function AdminRecapPage() {
  const location = useLocation();
  const demo = useVisualDemo();
  const visualState = getVisualState(location.search);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isReady = visualState === 'data' && demo.status === 'ready';

  const summary = useMemo(() => {
    if (demo.status !== 'ready') {
      return null;
    }
    const accepted = demo.data.recap.filter(
      (row) => row.status === 'hadir' || row.status === 'terlambat',
    ).length;
    return {
      roster: demo.data.recap.length,
      accepted,
      late: demo.data.recap.filter((row) => row.status === 'terlambat').length,
      notMarked: demo.data.recap.length - accepted,
      failedAttempts: demo.data.recap.filter((row) => row.status === 'gagal')
        .length,
    };
  }, [demo]);

  const actions = (
    <>
      <Button
        onClick={() =>
          setFeedback('Form sesi belum terhubung. Tidak ada sesi yang dibuat.')
        }
      >
        Buka sesi baru
      </Button>
      <Button
        variant="outline"
        className={styles.adminOutlineButton}
        onClick={() =>
          setFeedback('Ekspor belum terhubung. Tidak ada berkas yang dibuat.')
        }
      >
        Ekspor Excel
      </Button>
    </>
  );

  return (
    <AdminShell actions={actions}>
      <main className={styles.adminPage}>
        <div className={styles.simulationBanner} role="status">
          Mode simulasi — data tidak dikirim ke server
        </div>
        {(visualState === 'loading' || demo.status === 'loading') && (
          <LoadingState title="Memuat rekap sesi" />
        )}
        {visualState === 'error' && (
          <ErrorNotice title="Rekap tidak dapat dimuat">
            <p>Ini state gagal simulasi. Coba lagi setelah layanan tersedia.</p>
          </ErrorNotice>
        )}
        {(visualState === 'empty' || demo.status === 'unavailable') && (
          <EmptyState
            title="Belum ada data rekap"
            description="Data peserta akan tampil setelah tersedia dari server."
          />
        )}
        {isReady && summary && (
          <>
            <h1>{demo.data.session.title}</h1>
            <section
              className={styles.summaryGrid}
              aria-label="Ringkasan kehadiran"
            >
              <article>
                <p>Hadir</p>
                <strong>
                  {summary.accepted} / {summary.roster}
                </strong>
                <small>Termasuk peserta terlambat</small>
              </article>
              <article>
                <p>Terlambat</p>
                <strong>{summary.late}</strong>
                <small>Bagian dari hadir</small>
              </article>
              <article>
                <p>Belum absen</p>
                <strong>{summary.notMarked}</strong>
                <small>Belum memiliki kehadiran sah</small>
              </article>
            </section>
            <p className={styles.failedAttemptSummary}>
              Percobaan gagal terakhir:{' '}
              <strong>{summary.failedAttempts}</strong> — tidak dihitung sebagai
              hadir.
            </p>
            {feedback && (
              <ErrorNotice title="Fitur belum terhubung">
                <p>{feedback}</p>
              </ErrorNotice>
            )}
            <div
              className={styles.tableRegion}
              role="region"
              aria-label="Rekap peserta"
              tabIndex={0}
            >
              <table className={styles.recapTable}>
                <thead>
                  <tr>
                    <th scope="col">Peserta</th>
                    <th scope="col">Status</th>
                    <th scope="col">Waktu</th>
                    <th scope="col">Lokasi</th>
                    <th scope="col">Alasan gagal</th>
                  </tr>
                </thead>
                <tbody>
                  {demo.data.recap.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.participantName}</th>
                      <td>
                        <Badge tone={STATUS_TONES[row.status]}>
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </td>
                      <td>{row.markedAt ?? '—'}</td>
                      <td>{row.location ?? '—'}</td>
                      <td>{row.failureReason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </AdminShell>
  );
}
