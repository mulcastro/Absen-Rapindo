import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { SessionCard } from '../components/ui/SessionCard';
import { CameraPanel } from '../features/camera/CameraPanel';
import { useCamera } from '../features/camera/useCamera';
import { useAttendanceFlow } from '../features/attendance/useAttendanceFlow';
import { useLocationCapture } from '../features/location/useLocationCapture';
import { useParticipantSession } from '../features/sessions/useParticipantSession';
import styles from './ReferenceScreens.module.css';

export function AttendancePage() {
  const navigate = useNavigate();
  const { sessionId = '' } = useParams();
  const demo = useParticipantSession(sessionId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const camera = useCamera();
  const geo = useLocationCapture(sessionId);
  const attendance = useAttendanceFlow(sessionId);
  const markAttendanceReady = attendance.markReady;
  const resetAttendance = attendance.reset;
  const resetCamera = camera.reset;
  const resetGeo = geo.reset;
  const session = useMemo(
    () => (demo.status === 'ready' ? demo.data.session : null),
    [demo],
  );

  useEffect(() => {
    resetCamera();
    resetGeo();
    resetAttendance();
  }, [
    resetAttendance,
    resetCamera,
    resetGeo,
    sessionId,
    session?.geoRequired,
    session?.status,
  ]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  useEffect(() => {
    const locationReady =
      !session?.geoRequired || geo.state.status === 'captured';
    if (
      session?.status === 'open' &&
      locationReady &&
      camera.state.status === 'ready'
    ) {
      markAttendanceReady();
    }
  }, [
    markAttendanceReady,
    camera.state.status,
    geo.state.status,
    session?.geoRequired,
    session?.status,
  ]);

  const handleCameraAction = () => {
    setFeedback(null);
    if (!session || session.status !== 'open') return;
    if (attendance.state.phase === 'unknown') {
      void attendance.recover(
        (attemptId) => void navigate(`/hasil/${attemptId}`),
      );
      return;
    }
    if (!isOnline) {
      setFeedback(
        'Sambungkan perangkat ke internet sebelum melanjutkan absensi.',
      );
      return;
    }
    if (session.geoRequired && geo.state.status !== 'captured') {
      void geo.capture().catch(() => undefined);
      return;
    }
    if (camera.state.status === 'ready' && attendance.state.phase === 'ready') {
      void attendance.run({
        sessionId,
        location: geo.state.status === 'captured' ? geo.state.capture : null,
        capture: camera.capture,
        onConfirmed: (attemptId) => void navigate(`/hasil/${attemptId}`),
      });
      return;
    }
    if (
      attendance.state.phase === 'rejected' ||
      camera.state.status === 'captured'
    ) {
      camera.reset();
      attendance.reset();
      setFeedback(
        'Frame di memori sesi telah dihapus. Siapkan kamera kembali untuk percobaan baru.',
      );
      return;
    }
    void camera.start();
  };

  const cameraButtonLabel = (() => {
    if (attendance.state.phase === 'unknown') return 'Cek status absensi';
    if (session?.geoRequired && geo.state.status !== 'captured') {
      return geo.state.status === 'error'
        ? 'Coba ambil lokasi lagi'
        : 'Izinkan dan ambil lokasi';
    }
    if (camera.state.status === 'ready' && attendance.state.phase === 'ready') {
      return 'Mulai absen';
    }
    if (
      attendance.state.phase === 'rejected' ||
      camera.state.status === 'captured'
    ) {
      return 'Siapkan ulang';
    }
    if (camera.state.status === 'error') {
      return 'Coba aktifkan kamera lagi';
    }
    return 'Aktifkan kamera depan';
  })();

  const isBusy =
    geo.state.status === 'requesting' ||
    camera.state.status === 'requesting' ||
    camera.state.status === 'capturing' ||
    attendance.state.phase === 'starting' ||
    attendance.state.phase === 'submitting';

  const canCancelCamera = camera.state.status === 'ready';

  const cancelCamera = () => {
    camera.reset();
    attendance.reset();
    setFeedback('Kamera dinonaktifkan. Aktifkan kembali saat Anda siap.');
  };

  const content = (() => {
    if (demo.status === 'loading') {
      return <LoadingState title="Menyiapkan tampilan absensi" />;
    }

    if (demo.status === 'error') {
      return (
        <ErrorNotice title="Sesi tidak dapat dimuat">
          <p>Periksa koneksi internet, lalu coba kembali.</p>
        </ErrorNotice>
      );
    }

    if (demo.status === 'unavailable') {
      return (
        <EmptyState
          title="Belum ada sesi aktif"
          description="Sesi akan tampil setelah tersedia dari server."
        />
      );
    }

    if (!session) return null;

    return (
      <>
        <SessionCard
          title={session.title}
          schedule={session.schedule}
          location={session.locationLabel}
        />
        {session.status === 'open' && (
          <Button
            className={styles.backButton}
            variant="outline"
            disabled={isBusy}
            onClick={() => void navigate('/')}
          >
            ← Kembali ke daftar sesi
          </Button>
        )}
        {!isOnline && session.status === 'open' && (
          <ErrorNotice title="Tidak ada koneksi internet">
            <p>
              Absensi memerlukan koneksi internet. Sambungkan perangkat, lalu
              coba kembali.
            </p>
          </ErrorNotice>
        )}
        {session.status === 'open' && (
          <>
            <section className={styles.locationStatus} aria-live="polite">
              <h2>Akses lokasi diperlukan</h2>
              {!session.geoRequired && (
                <p>Sesi ini tidak memerlukan lokasi perangkat.</p>
              )}
              {session.geoRequired && geo.state.status === 'idle' && (
                <p>Izinkan akses lokasi untuk melanjutkan absensi.</p>
              )}
              {geo.state.status === 'requesting' && (
                <p>Sedang mengambil lokasi…</p>
              )}
              {geo.state.status === 'captured' && (
                <p>
                  Lokasi berhasil diambil dengan akurasi sekitar{' '}
                  {Math.round(geo.state.capture.accuracy)} meter.
                </p>
              )}
              {geo.state.status === 'error' && <p>{geo.state.error.message}</p>}
              <p className={styles.locationDisclaimer}>
                Lokasi digunakan untuk memastikan Anda berada di area pelatihan.
              </p>
            </section>
            <CameraPanel videoRef={camera.videoRef} state={camera.state} />
          </>
        )}
        {session.status === 'open' && (
          <>
            <ul className={styles.guidanceList} aria-label="Persiapan wajah">
              <li>
                <span aria-hidden="true">✓</span> Pencahayaan baik
              </li>
              <li>
                <span aria-hidden="true">✓</span> Wajah dalam bingkai
              </li>
              <li>
                <span aria-hidden="true">✓</span> Tanpa masker
              </li>
            </ul>
          </>
        )}
        {session.status === 'open' && camera.state.error && (
          <ErrorNotice title="Kamera tidak dapat digunakan">
            <p>{camera.state.error.message}</p>
          </ErrorNotice>
        )}
        {attendance.state.phase === 'rejected' && attendance.state.message && (
          <ErrorNotice title="Absensi belum berhasil">
            <p>{attendance.state.message}</p>
          </ErrorNotice>
        )}
        {attendance.state.phase === 'unknown' && attendance.state.message && (
          <ErrorNotice title="Hasil belum dapat dipastikan">
            <p>{attendance.state.message}</p>
          </ErrorNotice>
        )}
        {session.status === 'open' && feedback && (
          <ErrorNotice title="Kamera perlu disiapkan ulang">
            <p>{feedback}</p>
          </ErrorNotice>
        )}
      </>
    );
  })();

  const hasData = demo.status === 'ready';
  const canPrepare = hasData;

  return (
    <ParticipantShell
      title="Absensi"
      status={session ? <Badge tone="success">Sesi terbuka</Badge> : undefined}
    >
      <main className={styles.participantPage}>
        <div className={styles.participantContent}>{content}</div>
        {canPrepare && (
          <footer className={styles.participantFooter}>
            <div className={styles.attendanceActions}>
              <Button
                className={styles.fullButton}
                loading={isBusy}
                disabled={!isOnline}
                loadingLabel={
                  geo.state.status === 'requesting'
                    ? 'Mengambil lokasi…'
                    : attendance.state.phase === 'starting'
                      ? 'Memulai percobaan…'
                      : attendance.state.phase === 'submitting'
                        ? 'Memverifikasi absensi…'
                        : camera.state.status === 'capturing'
                          ? 'Mengambil gambar…'
                          : 'Menyiapkan kamera…'
                }
                onClick={handleCameraAction}
              >
                {cameraButtonLabel}
              </Button>
              {canCancelCamera && attendance.state.phase !== 'unknown' && (
                <Button variant="outline" onClick={cancelCamera}>
                  Batalkan kamera
                </Button>
              )}
            </div>
            <p>
              Foto wajah diproses secara aman hanya untuk keperluan absensi
              pelatihan.
            </p>
          </footer>
        )}
      </main>
    </ParticipantShell>
  );
}
