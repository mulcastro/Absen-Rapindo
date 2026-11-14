import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { SessionCard } from '../components/ui/SessionCard';
import {
  loadAttendanceService,
  type ParticipantSession,
} from '../services/attendance';
import styles from './GeneralPages.module.css';
import { useAuth } from '../features/auth/authContextValue';

export function ActiveSessionsPage() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [sessions, setSessions] = useState<readonly ParticipantSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadAttendanceService()
      .then((service) => service.listActiveSessions(controller.signal))
      .then(setSessions)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Sesi aktif tidak dapat dimuat.',
          );
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => loadSessions(), [loadSessions]);

  return (
    <ParticipantShell title="Beranda">
      <main className={styles.main}>
        <section className={styles.welcome}>
          <div>
            <p className={styles.eyebrow}>ABSENSI PELATIHAN</p>
            <h1>Halo, {session?.displayName ?? 'Peserta'}</h1>
            <p>Pilih sesi yang sedang berlangsung untuk melakukan absensi.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => void logout().finally(() => void navigate('/masuk'))}
          >
            Keluar
          </Button>
        </section>
        {loading && <LoadingState title="Memuat sesi aktif" />}
        {error && (
          <ErrorNotice title="Sesi tidak dapat dimuat">
            <p>{error}</p>
          </ErrorNotice>
        )}
        {!loading && !error && sessions.length === 0 && (
          <EmptyState
            title="Belum ada sesi yang dibuka"
            description="Silakan periksa kembali sesuai jadwal pelatihan atau hubungi pengelola."
            action={
              <Button variant="outline" onClick={loadSessions}>
                Periksa kembali
              </Button>
            }
          />
        )}
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            title={session.title}
            schedule={session.schedule}
            location={session.locationLabel}
            status="open"
            actions={
              <Button
                className={styles.sessionAction}
                onClick={() => void navigate(`/absen/${session.id}`)}
              >
                Lanjut ke absensi
              </Button>
            }
          />
        ))}
      </main>
    </ParticipantShell>
  );
}
