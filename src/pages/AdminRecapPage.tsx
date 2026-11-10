import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AdminShell } from '../components/layout/AdminShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { summarizeRoster } from '../features/admin/adminModel';
import { loadAdminService, type SessionRecap } from '../services/admin';
import styles from './ReferenceScreens.module.css';

export function AdminRecapPage() {
  const { sessionId = '' } = useParams();
  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadAdminService()
      .then((service) => service.getRecap(sessionId))
      .then((data) => {
        if (active) setRecap(data);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Rekap tidak dapat dimuat.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  const summary = useMemo(
    () => (recap ? summarizeRoster(recap.roster) : null),
    [recap],
  );
  const requestExport = async (format: 'xlsx' | 'pdf') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setFeedback(null);
    try {
      const service = await loadAdminService();
      await service.requestExport(sessionId, format);
      setFeedback({
        tone: 'success',
        message: `Daftar hadir ${format === 'xlsx' ? 'Excel' : 'PDF'} berhasil diunduh.`,
      });
    } catch (reason) {
      setFeedback({
        tone: 'error',
        message:
          reason instanceof Error
            ? reason.message
            : 'Ekspor gagal. Tidak ada berkas yang dibuat.',
      });
    } finally {
      busyRef.current = false;
    }
  };
  const actions = (
    <>
      <Button
        variant="outline"
        className={styles.adminOutlineButton}
        onClick={() => void requestExport('xlsx')}
      >
        Ekspor Excel
      </Button>
      <Button
        variant="outline"
        className={styles.adminOutlineButton}
        onClick={() => void requestExport('pdf')}
      >
        Ekspor PDF
      </Button>
    </>
  );

  return (
    <AdminShell actions={actions}>
      <main className={styles.adminPage}>
        {loading && <LoadingState title="Memuat rekap sesi" />}
        {error && (
          <ErrorNotice title="Rekap tidak dapat dimuat">
            <p>{error}</p>
          </ErrorNotice>
        )}
        {recap?.stale && (
          <ErrorNotice title="Rekap mungkin sudah berubah">
            <p>Muat ulang data sebelum mengambil keputusan operasional.</p>
          </ErrorNotice>
        )}
        {recap && recap.roster.length === 0 && (
          <EmptyState
            title="Belum ada data rekap"
            description="Roster sesi belum berisi peserta."
          />
        )}
        {recap && recap.roster.length > 0 && summary && (
          <>
            <Link className={styles.backLink} to="/admin/sesi">
              ← Kembali ke daftar sesi
            </Link>
            <div className={styles.adminTitle}>
              <p>REKAP KEHADIRAN</p>
              <h1>{recap.session.title}</h1>
            </div>
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
              <strong>{summary.failedAttempts}</strong> — dicatat terpisah dan
              tidak dihitung sebagai hadir.
            </p>
            {feedback?.tone === 'error' && (
              <ErrorNotice title="Informasi ekspor">
                <p>{feedback.message}</p>
              </ErrorNotice>
            )}
            {feedback?.tone === 'success' && (
              <p className={styles.exportSuccess} role="status">
                {feedback.message}
              </p>
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
                    <th scope="col">Kehadiran sah</th>
                    <th scope="col">Waktu</th>
                    <th scope="col">Lokasi</th>
                    <th scope="col">Percobaan gagal terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.roster.map((row) => (
                    <tr key={row.participantId}>
                      <th scope="row">{row.participantName}</th>
                      <td>
                        {row.attendance ? (
                          <Badge
                            tone={
                              row.attendance.status === 'terlambat'
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {row.attendance.status === 'terlambat'
                              ? 'Terlambat'
                              : 'Hadir'}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Belum</Badge>
                        )}
                      </td>
                      <td>{row.attendance?.markedAt ?? '—'}</td>
                      <td>{row.attendance?.location ?? '—'}</td>
                      <td>
                        {row.latestFailedAttempt
                          ? `${row.latestFailedAttempt.occurredAt} — ${row.latestFailedAttempt.reason}`
                          : '—'}
                      </td>
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
