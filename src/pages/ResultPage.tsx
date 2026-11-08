import { useNavigate, useParams } from 'react-router';

import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { appConfig } from '../config/appConfig';
import { useAttendanceResult } from '../features/attendance/useAttendanceResult';
import styles from './ReferenceScreens.module.css';

export function ResultPage() {
  const navigate = useNavigate();
  const { attemptId = '' } = useParams();
  const state = useAttendanceResult(attemptId);
  const confirmed = state.status === 'confirmed' ? state.result : null;
  const attendance =
    confirmed && confirmed.outcome !== 'rejected' ? confirmed.attendance : null;

  return (
    <ParticipantShell title="Absen">
      <main className={styles.resultPage}>
        <div className={styles.resultContent}>
          {state.status === 'loading' && (
            <LoadingState title="Memuat hasil absensi" />
          )}
          {(state.status === 'unknown' || state.status === 'unavailable') && (
            <ErrorNotice title="Hasil belum dapat dipastikan">
              <p>{state.message}</p>
            </ErrorNotice>
          )}
          {confirmed?.outcome === 'rejected' && (
            <EmptyState
              title="Absensi belum berhasil"
              description={confirmed.message}
            />
          )}
          {attendance && (
            <>
              {appConfig.dataSource === 'mock' && (
                <p className={styles.participantSimulation} role="status">
                  Mode simulasi — data tidak dikirim ke server
                </p>
              )}
              <div className={styles.successMark} aria-hidden="true">
                <span />
              </div>
              <h1>
                {confirmed?.outcome === 'already_recorded'
                  ? 'Sudah tercatat'
                  : 'Absen berhasil'}
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
                    <dt>ID sesi</dt>
                    <dd>{attendance.sessionId}</dd>
                  </div>
                  <div>
                    <dt>Waktu server</dt>
                    <dd className={styles.resultTime}>
                      {attendance.markedAt}{' '}
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
