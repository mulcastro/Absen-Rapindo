import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

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
import { applyDevelopmentSessionState } from '../features/sessions/sessionView';
import {
  getVisualState,
  useVisualDemo,
} from '../features/visual-demo/useVisualDemo';
import styles from './ReferenceScreens.module.css';

export function AttendancePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId = '' } = useParams();
  const demo = useVisualDemo();
  const visualState = getVisualState(location.search);
  const [feedback, setFeedback] = useState<string | null>(null);
  const camera = useCamera();
  const geo = useLocationCapture(sessionId);
  const attendance = useAttendanceFlow(sessionId);
  const markAttendanceReady = attendance.markReady;
  const resetAttendance = attendance.reset;
  const resetCamera = camera.reset;
  const resetGeo = geo.reset;
  const session = useMemo(
    () =>
      demo.status === 'ready'
        ? applyDevelopmentSessionState(demo.data.session, location.search)
        : null,
    [demo, location.search],
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

  const content = (() => {
    if (visualState === 'loading' || demo.status === 'loading') {
      return <LoadingState title="Menyiapkan tampilan absensi" />;
    }

    if (visualState === 'error') {
      return (
        <ErrorNotice title="Tampilan tidak dapat dimuat">
          <p>Ini state gagal simulasi. Belum ada data yang dikirim.</p>
        </ErrorNotice>
      );
    }

    if (visualState === 'empty' || demo.status === 'unavailable') {
      return (
        <EmptyState
          title="Belum ada sesi aktif"
          description="Sesi akan tampil setelah tersedia dari server."
        />
      );
    }

    if (!session) return null;

    const sessionNotice = (() => {
      if (session.status === 'unknown') {
        return (
          <LoadingState
            title="Status sesi belum termuat"
            description="Tunggu status resmi dari server sebelum memulai absensi."
          />
        );
      }
      if (session.status === 'closed') {
        return (
          <ErrorNotice title="Sesi sudah ditutup">
            <p>
              Absensi tidak dapat dimulai. Status ini berasal dari data sesi.
            </p>
          </ErrorNotice>
        );
      }
      if (session.status === 'expired') {
        return (
          <ErrorNotice title="Sesi telah kedaluwarsa">
            <p>Kembali ke daftar sesi untuk memeriksa sesi aktif lainnya.</p>
          </ErrorNotice>
        );
      }
      return null;
    })();

    return (
      <>
        <p className={styles.participantSimulation} role="status">
          Mode simulasi — data tidak dikirim ke server
        </p>
        <SessionCard
          title={session.title}
          schedule={session.schedule}
          location={session.locationLabel}
        />
        {sessionNotice}
        {session.status === 'open' && (
          <>
            <section className={styles.locationStatus} aria-live="polite">
              <h2>Lokasi perangkat</h2>
              {!session.geoRequired && (
                <p>
                  Lokasi tidak diwajibkan untuk sesi ini. Browser tidak akan
                  meminta izin GPS.
                </p>
              )}
              {session.geoRequired && geo.state.status === 'idle' && (
                <p>Izin lokasi diminta setelah Anda menekan tombol di bawah.</p>
              )}
              {geo.state.status === 'requesting' && (
                <p>Mengambil lokasi perangkat…</p>
              )}
              {geo.state.status === 'captured' && (
                <p>
                  Lokasi telah diambil dengan akurasi ±
                  {Math.round(geo.state.capture.accuracy)} meter. Belum
                  diverifikasi server.
                </p>
              )}
              {geo.state.status === 'error' && <p>{geo.state.error.message}</p>}
              <p className={styles.locationDisclaimer}>
                Waktu dan status area ditentukan server; jam HP bukan dasar
                keterlambatan.
              </p>
            </section>
            <CameraPanel videoRef={camera.videoRef} state={camera.state} />
          </>
        )}
        {session.status === 'open' && (
          <>
            <ul
              className={styles.guidanceList}
              aria-label="Panduan posisi wajah"
            >
              <li>Cahaya cukup</li>
              <li>Jarak pas</li>
              <li>Tanpa masker</li>
            </ul>
            <p className={styles.guidanceNote}>
              Panduan ini bukan hasil deteksi otomatis.
            </p>
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
          <ErrorNotice title="Informasi kamera">
            <p>{feedback}</p>
          </ErrorNotice>
        )}
      </>
    );
  })();

  const hasData = visualState === 'data' && demo.status === 'ready';
  const canPrepare = hasData && session?.status === 'open';

  return (
    <ParticipantShell
      title="Absen"
      status={
        session?.status === 'open' ? (
          <Badge tone="success">Sesi terbuka</Badge>
        ) : session?.status === 'unknown' ? (
          <Badge tone="neutral">Status belum termuat</Badge>
        ) : session ? (
          <Badge tone="failure">Sesi tidak aktif</Badge>
        ) : undefined
      }
    >
      <main className={styles.participantPage}>
        <div className={styles.participantContent}>{content}</div>
        {canPrepare && (
          <footer className={styles.participantFooter}>
            <Button
              className={styles.fullButton}
              loading={
                geo.state.status === 'requesting' ||
                camera.state.status === 'requesting' ||
                camera.state.status === 'capturing' ||
                attendance.state.phase === 'starting' ||
                attendance.state.phase === 'submitting'
              }
              disabled={attendance.state.phase === 'unknown'}
              loadingLabel={
                geo.state.status === 'requesting'
                  ? 'Mengambil lokasi…'
                  : attendance.state.phase === 'starting'
                    ? 'Memulai percobaan…'
                    : attendance.state.phase === 'submitting'
                      ? 'Memverifikasi absensi…'
                      : camera.state.status === 'capturing'
                        ? `Mengambil ${camera.state.capturedCount}/${camera.state.targetCount} frame…`
                        : 'Meminta izin kamera…'
              }
              onClick={handleCameraAction}
            >
              {cameraButtonLabel}
            </Button>
            <p>Foto wajah hanya dipakai untuk absensi pelatihan.</p>
          </footer>
        )}
      </main>
    </ParticipantShell>
  );
}
