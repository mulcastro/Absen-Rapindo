import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link } from 'react-router';

import { AdminShell } from '../components/layout/AdminShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { Input } from '../components/ui/Input';
import {
  loadAdminService,
  type AdminSession,
  type CreateSessionInput,
} from '../services/admin';
import styles from './AdminPages.module.css';

const EMPTY_FORM = {
  title: '',
  startsAt: '',
  endsAt: '',
  lateAfterMinutes: '15',
  geoRequired: false,
  latitude: '',
  longitude: '',
  radius: '',
  accuracy: '',
};

export function AdminSessionsPage() {
  const [sessions, setSessions] = useState<readonly AdminSession[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const service = await loadAdminService();
      setSessions(await service.listSessions());
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Daftar sesi gagal dimuat.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setFeedback(null);
    if (!form.title.trim() || !form.startsAt || !form.endsAt)
      return setFeedback('Judul, mulai, dan akhir wajib diisi.');
    if (new Date(form.endsAt) <= new Date(form.startsAt))
      return setFeedback('Waktu akhir harus setelah waktu mulai.');
    const lateAfterMinutes = Number(form.lateAfterMinutes);
    if (!Number.isFinite(lateAfterMinutes) || lateAfterMinutes < 0)
      return setFeedback('Batas terlambat tidak valid.');
    let geo: Pick<
      CreateSessionInput,
      'geoCenter' | 'geoRadiusMeters' | 'geoAccuracyMeters'
    > = {
      geoCenter: null,
      geoRadiusMeters: null,
      geoAccuracyMeters: null,
    };
    if (form.geoRequired) {
      const latitude = Number(form.latitude);
      const longitude = Number(form.longitude);
      const radius = Number(form.radius);
      const accuracy = Number(form.accuracy);
      if (
        ![latitude, longitude, radius, accuracy].every(Number.isFinite) ||
        !form.latitude ||
        !form.longitude ||
        radius <= 0 ||
        accuracy <= 0
      ) {
        return setFeedback(
          'Pusat koordinat, radius, dan target akurasi wajib diisi saat lokasi diwajibkan.',
        );
      }
      geo = {
        geoCenter: { latitude, longitude },
        geoRadiusMeters: radius,
        geoAccuracyMeters: accuracy,
      };
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const service = await loadAdminService();
      await service.createSession({
        title: form.title.trim(),
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        lateAfterMinutes,
        geoRequired: form.geoRequired,
        ...geo,
      });
      setForm(EMPTY_FORM);
      setFeedback('Sesi berhasil dibuat sebagai draf.');
      await reload();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Sesi gagal dibuat.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const changeStatus = async (session: AdminSession) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const service = await loadAdminService();
      if (session.status === 'open') await service.closeSession(session.id);
      else await service.openSession(session.id);
      await reload();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Status sesi gagal diubah.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>MANAJEMEN ABSENSI</p>
            <h1>Sesi absensi</h1>
            <p>Atur jadwal, ketentuan lokasi, dan pantau rekap kehadiran.</p>
          </div>
        </header>
        <form
          className={`${styles.card} ${styles.formGrid}`}
          onSubmit={(event) => void submit(event)}
        >
          <div className={`${styles.sectionHeading} ${styles.full}`}>
            <div>
              <h2>Buat sesi baru</h2>
              <p>Sesi disimpan sebagai draf sebelum dibuka untuk peserta.</p>
            </div>
          </div>
          <Input
            label="Judul sesi"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
          <Input
            label="Batas terlambat (menit)"
            type="number"
            min="0"
            value={form.lateAfterMinutes}
            onChange={(event) =>
              setForm({ ...form, lateAfterMinutes: event.target.value })
            }
          />
          <Input
            label="Mulai"
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) =>
              setForm({ ...form, startsAt: event.target.value })
            }
          />
          <Input
            label="Akhir"
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) =>
              setForm({ ...form, endsAt: event.target.value })
            }
          />
          <label className={`${styles.checkbox} ${styles.full}`}>
            <input
              type="checkbox"
              checked={form.geoRequired}
              onChange={(event) =>
                setForm({ ...form, geoRequired: event.target.checked })
              }
            />
            Wajibkan lokasi
          </label>
          {form.geoRequired && (
            <>
              <Input
                label="Latitude pusat"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(event) =>
                  setForm({ ...form, latitude: event.target.value })
                }
              />
              <Input
                label="Longitude pusat"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(event) =>
                  setForm({ ...form, longitude: event.target.value })
                }
              />
              <Input
                label="Radius (meter)"
                type="number"
                min="1"
                value={form.radius}
                onChange={(event) =>
                  setForm({ ...form, radius: event.target.value })
                }
              />
              <Input
                label="Target akurasi (meter)"
                type="number"
                min="1"
                value={form.accuracy}
                onChange={(event) =>
                  setForm({ ...form, accuracy: event.target.value })
                }
              />
            </>
          )}
          <Button className={styles.full} type="submit" loading={busy}>
            Simpan sebagai draf
          </Button>
        </form>
        {feedback && (
          <ErrorNotice title="Informasi sesi">
            <p>{feedback}</p>
          </ErrorNotice>
        )}
        {loading ? (
          <LoadingState title="Memuat daftar sesi" />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="Belum ada sesi"
            description="Buat sesi pertama melalui form di atas."
          />
        ) : (
          <section className={styles.grid} aria-label="Daftar sesi">
            {sessions.map((session) => (
              <article className={styles.card} key={session.id}>
                <Badge
                  tone={
                    session.status === 'open'
                      ? 'success'
                      : session.status === 'closed'
                        ? 'failure'
                        : 'neutral'
                  }
                >
                  {session.status === 'open'
                    ? 'Terbuka'
                    : session.status === 'closed'
                      ? 'Ditutup'
                      : 'Draf'}
                </Badge>
                <h2>{session.title}</h2>
                <p>
                  {new Intl.DateTimeFormat('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(session.startsAt))}{' '}
                  –{' '}
                  {new Intl.DateTimeFormat('id-ID', {
                    timeStyle: 'short',
                  }).format(new Date(session.endsAt))}
                </p>
                <p>
                  {session.geoRequired
                    ? 'Lokasi diwajibkan'
                    : 'Lokasi opsional'}
                </p>
                <div className={styles.actions}>
                  <Link
                    className={styles.actionLink}
                    to={`/admin/sesi/${encodeURIComponent(session.id)}`}
                  >
                    Lihat rekap
                  </Link>
                  <Button
                    loading={busy}
                    onClick={() => void changeStatus(session)}
                  >
                    {session.status === 'open' ? 'Tutup sesi' : 'Buka sesi'}
                  </Button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </AdminShell>
  );
}
