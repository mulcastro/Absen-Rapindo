import { useNavigate, useParams } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { useAttendanceResult } from '../features/attendance/useAttendanceResult';
import styles from './ReferenceScreens.module.css';

function formatAttendanceTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ResultPage() {
  const navigate = useNavigate();
  const { attemptId = '' } = useParams();
  const state = useAttendanceResult(attemptId);
  const confirmed = state.status === 'confirmed' ? state.result : null;
  const attendance =
    confirmed && confirmed.outcome !== 'rejected' ? confirmed.attendance : null;

  return (
    <ParticipantShell title="Hasil absensi">
      <main className={styles.resultPage}>
        <div className={styles.resultContent}>
          {state.status === 'loading' && (
            <LoadingState title="Memuat hasil absensi" />
          )}
          {(state.status === 'unknown' || state.status === 'unavailable') && (
            <div className={styles.resultState}>
              <ErrorNotice title="Hasil belum dapat dipastikan">
                <p>{state.message}</p>
              </ErrorNotice>
              <Button onClick={state.refresh}>Periksa kembali</Button>
              <Button variant="outline" onClick={() => void navigate('/')}>
                Kembali ke daftar sesi
              </Button>
            </div>
          )}
          {confirmed?.outcome === 'rejected' && (
            <EmptyState
              title="Absensi belum berhasil"
              description={confirmed.message}
              action={
                <Button onClick={() => void navigate('/')}>
                  Kembali ke daftar sesi
                </Button>
              }
            />
          )}
          {attendance && (
            <>
              <div className={styles.successMark} aria-hidden="true">
                <span />
              </div>
              <h1>
                {confirmed?.outcome === 'already_recorded'
                  ? 'Sudah tercatat'
                  : 'Absensi berhasil'}
              </h1>
              <section
                className={styles.resultCard}
                aria-label="Ringkasan hasil absensi"
              >
                <dl>
                  <div>
                    <dt>Peserta</dt>
                    <dd>{attendance.participantName}</dd>
                  </div>
                  <div>
                    <dt>Sesi</dt>
                    <dd>{attendance.sessionTitle ?? attendance.sessionId}</dd>
                  </div>
                  <div>
                    <dt>Waktu absensi</dt>
                    <dd className={styles.resultTime}>
                      {formatAttendanceTime(attendance.markedAt)}{' '}
                      <Badge
                        tone={
                          attendance.status === 'hadir' ? 'success' : 'warning'
                        }
                      >
                        {attendance.status === 'hadir' ? 'Hadir' : 'Terlambat'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </section>
            </>
          )}
        </div>
        {attendance && (
          <footer className={styles.resultFooter}>
            <Button
              variant="secondary"
              className={styles.fullButton}
              onClick={() => void navigate('/')}
            >
              Selesai
            </Button>
          </footer>
        )}
      </main>
    </ParticipantShell>
  );
}
