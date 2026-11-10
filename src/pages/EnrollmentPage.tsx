import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { PINInput } from '../components/ui/Input';
import { CameraPanel } from '../features/camera/CameraPanel';
import { useCamera } from '../features/camera/useCamera';
import type { CapturedFrame } from '../features/camera/types';
import {
  loadIdentityService,
  type EnrollmentChallenge,
  type EnrollmentInvite,
  type EnrollmentResult,
} from '../services/identity';
import styles from './IdentityPages.module.css';

type Stage = 'consent' | 'pin' | 'old-face' | 'challenge' | 'result';

export function EnrollmentPage() {
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const camera = useCamera();
  const resetCamera = camera.reset;
  const [invite, setInvite] = useState<EnrollmentInvite | null>(null);
  const [challenge, setChallenge] = useState<EnrollmentChallenge | null>(null);
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [stage, setStage] = useState<Stage>('consent');
  const [accepted, setAccepted] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [oldFaceFrames, setOldFaceFrames] = useState<readonly CapturedFrame[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    resetCamera();
    setInvite(null);
    setChallenge(null);
    setResult(null);
    setStage('consent');
    setAccepted(false);
    setPin('');
    setConfirmation('');
    setOldFaceFrames([]);
    setError(null);
    setLoading(true);
    void loadIdentityService()
      .then((service) => service.getInvite(token))
      .then((value) => active && setInvite(value))
      .catch(
        (reason: unknown) =>
          active &&
          setError(
            reason instanceof Error
              ? reason.message
              : 'Undangan tidak dapat dimuat.',
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      resetCamera();
    };
  }, [resetCamera, token]);

  const continueConsent = () => {
    if (!accepted)
      return setError(
        'Persetujuan harus diberikan secara aktif untuk melanjutkan.',
      );
    setError(null);
    setStage('pin');
  };

  const requestChallenge = async () => {
    if (!invite) return;
    if (!/^\d{6}$/.test(pin)) return setError('PIN harus tepat enam digit.');
    if (pin !== confirmation) return setError('Konfirmasi PIN tidak sama.');
    setError(null);
    setLoading(true);
    try {
      const service = await loadIdentityService();
      setChallenge(
        await service.createChallenge(token, invite.consent.version),
      );
      setStage(invite.purpose === 'reenroll' ? 'old-face' : 'challenge');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Challenge tidak tersedia.',
      );
    } finally {
      setLoading(false);
    }
  };

  const captureOldFace = async () => {
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const frames = await camera.capture({
        frameCount: challenge.capture.frameCount,
        durationMs: challenge.capture.durationMs,
        jpegQuality: 0.86,
      });
      setOldFaceFrames(frames);
      resetCamera();
      setStage('challenge');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Verifikasi wajah lama tidak dapat diambil.',
      );
    } finally {
      setLoading(false);
    }
  };

  const captureAndSubmit = async () => {
    if (!invite || !challenge) return;
    setError(null);
    setLoading(true);
    try {
      const frames = await camera.capture({
        frameCount: challenge.capture.frameCount,
        durationMs: challenge.capture.durationMs,
        jpegQuality: 0.86,
      });
      const service = await loadIdentityService();
      const enrollmentResult = await service.submitEnrollment({
        token,
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        consentVersion: invite.consent.version,
        consentAccepted: true,
        pin,
        frames,
        oldFaceFrames:
          invite.purpose === 'reenroll' ? oldFaceFrames : undefined,
      });
      setPin('');
      setConfirmation('');
      setOldFaceFrames([]);
      resetCamera();
      setResult(enrollmentResult);
      setStage('result');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Enrollment tidak dapat diproses.',
      );
    } finally {
      setLoading(false);
    }
  };

  const unavailable = invite && invite.status !== 'valid';
  return (
    <ParticipantShell
      title="Pendaftaran peserta"
      status={
        invite && !invite.consent.draft ? (
          <Badge tone="neutral">Terhubung server</Badge>
        ) : undefined
      }
    >
      <main className={styles.page}>
        {loading && !invite && <LoadingState title="Memeriksa undangan" />}
        {unavailable && (
          <EmptyState
            title={
              invite.status === 'expired'
                ? 'Undangan kedaluwarsa'
                : invite.status === 'used'
                  ? 'Undangan sudah digunakan'
                  : invite.status === 'duplicate'
                    ? 'Peserta sudah terdaftar'
                    : 'Pendaftaran ditolak'
            }
            description={
              invite.purpose === 'reenroll'
                ? 'Minta tautan pendaftaran ulang yang baru kepada pengelola.'
                : 'Hubungi admin untuk mendapatkan undangan yang sesuai.'
            }
            action={
              <Button variant="outline" onClick={() => void navigate('/masuk')}>
                Ke halaman masuk
              </Button>
            }
          />
        )}
        {invite?.status === 'valid' && stage === 'consent' && (
          <section className={styles.card}>
            <p className={styles.progress}>
              Langkah 1 dari {invite.purpose === 'reenroll' ? '4' : '3'}
            </p>
            <h1>
              {invite.purpose === 'reenroll'
                ? 'Perbarui data wajah dan PIN'
                : 'Aktifkan akun peserta'}
            </h1>
            <p>Peserta: {invite.participantName}</p>
            <div className={styles.draft}>
              <strong>Persetujuan penggunaan data wajah</strong>
              <p>{invite.consent.text}</p>
            </div>
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>
                Saya telah membaca dan menyetujui pemrosesan data wajah untuk
                keperluan absensi pelatihan.
              </span>
            </label>
            <Button onClick={continueConsent}>Setuju dan lanjutkan</Button>
          </section>
        )}
        {invite?.status === 'valid' && stage === 'pin' && (
          <section className={styles.card}>
            <p className={styles.progress}>
              Langkah 2 dari {invite.purpose === 'reenroll' ? '4' : '3'}
            </p>
            <h1>Buat PIN keamanan</h1>
            <p>PIN digunakan bersama kode peserta setiap kali Anda masuk.</p>
            <PINInput
              label="PIN baru 6 digit"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ''))
              }
              autoComplete="new-password"
            />
            <PINInput
              label="Konfirmasi PIN"
              value={confirmation}
              onChange={(event) =>
                setConfirmation(event.target.value.replace(/\D/g, ''))
              }
              autoComplete="new-password"
            />
            <div className={styles.actionsVertical}>
              <Button loading={loading} onClick={() => void requestChallenge()}>
                Lanjutkan ke verifikasi wajah
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStage('consent');
                }}
              >
                Kembali
              </Button>
            </div>
          </section>
        )}
        {invite?.status === 'valid' && stage === 'old-face' && challenge && (
          <section className={styles.card}>
            <p className={styles.progress}>Langkah 3 dari 4</p>
            <h1>Verifikasi wajah sebelumnya</h1>
            <p>
              Posisikan wajah di dalam bingkai untuk memastikan identitas Anda
              sebelum memperbarui data.
            </p>
            <CameraPanel videoRef={camera.videoRef} state={camera.state} />
            <div className={styles.actions}>
              {camera.state.status !== 'ready' && (
                <Button onClick={() => void camera.start()}>
                  Izinkan kamera
                </Button>
              )}
              {camera.state.status === 'ready' && (
                <Button loading={loading} onClick={() => void captureOldFace()}>
                  Verifikasi wajah
                </Button>
              )}
              <Button variant="outline" onClick={() => void navigate('/masuk')}>
                Batalkan pendaftaran
              </Button>
            </div>
          </section>
        )}
        {invite?.status === 'valid' && stage === 'challenge' && challenge && (
          <section className={styles.card}>
            <p className={styles.progress}>
              {invite.purpose === 'reenroll'
                ? 'Langkah 4 dari 4'
                : 'Langkah 3 dari 3'}
            </p>
            <h1>Verifikasi wajah</h1>
            {invite.purpose === 'reenroll' && (
              <p>
                Identitas berhasil diperiksa. Sekarang daftarkan wajah terbaru.
              </p>
            )}
            <p>
              Ikuti gerakan berikut secara perlahan sambil menjaga wajah tetap
              berada di dalam bingkai.
            </p>
            <ol className={styles.steps}>
              {challenge.orderedSteps.map((step) => (
                <li key={step}>
                  {step === 'lurus'
                    ? 'Lihat lurus'
                    : step === 'kiri'
                      ? 'Gerakkan wajah ke kiri'
                      : 'Gerakkan wajah ke kanan'}
                </li>
              ))}
            </ol>
            <p>
              Selesaikan langkah ini tanpa berpindah halaman agar proses tidak
              perlu diulang.
            </p>
            <CameraPanel videoRef={camera.videoRef} state={camera.state} />
            <div className={styles.actions}>
              {camera.state.status !== 'ready' && (
                <Button onClick={() => void camera.start()}>
                  Izinkan kamera
                </Button>
              )}
              {camera.state.status === 'ready' && (
                <Button
                  loading={loading}
                  onClick={() => void captureAndSubmit()}
                >
                  Mulai verifikasi wajah
                </Button>
              )}
              <Button variant="outline" onClick={() => void navigate('/masuk')}>
                Batalkan pendaftaran
              </Button>
            </div>
          </section>
        )}
        {stage === 'result' &&
          result &&
          (result.status === 'enrolled' ? (
            <EmptyState
              title="Akun berhasil diaktifkan"
              description="Pendaftaran selesai. Silakan masuk menggunakan kode peserta dan PIN Anda."
              action={
                <Button onClick={() => void navigate('/masuk')}>
                  Masuk ke akun
                </Button>
              }
            />
          ) : (
            <ErrorNotice
              title={
                result.status === 'duplicate'
                  ? 'Peserta sudah terdaftar'
                  : result.status === 'expired'
                    ? 'Waktu verifikasi berakhir'
                    : 'Pendaftaran ditolak'
              }
            >
              <p>{result.message}</p>
            </ErrorNotice>
          ))}
        {error && (
          <ErrorNotice>
            <p>{error}</p>
          </ErrorNotice>
        )}
      </main>
    </ParticipantShell>
  );
}
