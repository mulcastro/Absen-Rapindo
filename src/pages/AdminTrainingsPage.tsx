import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate } from 'react-router';

import { AdminShell } from '../components/layout/AdminShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  SuccessNotice,
} from '../components/ui/Feedback';
import { Input } from '../components/ui/Input';
import { loadAdminService, type TrainingSummary } from '../services/admin';
import styles from './AdminPages.module.css';

function formatHeldOn(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(parsed);
}

export function AdminTrainingsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<readonly TrainingSummary[]>([]);
  const [title, setTitle] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const service = await loadAdminService();
      setItems(await service.listTrainings());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Daftar pelatihan gagal dimuat.',
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
    setError(null);
    setNotice(null);
    if (!title.trim() || !heldOn) {
      setError('Nama pelatihan dan tanggal pelaksanaan wajib diisi.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const service = await loadAdminService();
      const created = await service.createTraining({
        title: title.trim(),
        heldOn,
      });
      setTitle('');
      setHeldOn('');
      setNotice('Pelatihan siap diisi peserta dan jadwal sesi.');
      await reload();
      void navigate(`/admin/pelatihan/${encodeURIComponent(created.id)}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Pelatihan gagal dibuat.',
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
            <p className={styles.eyebrow}>OPERASI PELATIHAN</p>
            <h1>Pelatihan</h1>
            <p>
              Satu pelatihan untuk satu hari kelas. Daftarkan peserta di H−1,
              lalu jalankan Sesi 1 dan Sesi 2 pada hari pelaksanaan.
            </p>
          </div>
        </header>
        <form
          className={`${styles.card} ${styles.formGrid}`}
          onSubmit={(event) => void submit(event)}
        >
          <div className={`${styles.sectionHeading} ${styles.full}`}>
            <div>
              <h2>Buat pelatihan baru</h2>
              <p>
                Gunakan nama angkatan atau topik, misalnya “K3 Umum — 14
                November 2026”.
              </p>
            </div>
          </div>
          <Input
            label="Nama pelatihan"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Input
            label="Tanggal pelaksanaan"
            type="date"
            value={heldOn}
            onChange={(event) => setHeldOn(event.target.value)}
          />
          <Button className={styles.full} type="submit" loading={busy}>
            Buat pelatihan
          </Button>
        </form>
        {error && (
          <ErrorNotice title="Tidak dapat menyimpan">
            <p>{error}</p>
          </ErrorNotice>
        )}
        {notice && (
          <SuccessNotice title="Pelatihan dibuat">
            <p>{notice}</p>
          </SuccessNotice>
        )}
        {loading ? (
          <LoadingState title="Memuat daftar pelatihan" />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada pelatihan"
            description="Buat pelatihan pertama, lalu impor CSV peserta untuk hari tersebut."
          />
        ) : (
          <section className={styles.grid} aria-label="Daftar pelatihan">
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                <Badge
                  tone={
                    item.enrolledCount === item.participantCount &&
                    item.participantCount > 0
                      ? 'success'
                      : 'neutral'
                  }
                >
                  {item.enrolledCount}/{item.participantCount} wajah siap
                </Badge>
                <h2>{item.title}</h2>
                <p>{formatHeldOn(item.heldOn)}</p>
                <p>
                  {item.sessionCount} sesi · {item.participantCount} peserta
                </p>
                <div className={styles.actions}>
                  <Link
                    className={styles.actionLink}
                    to={`/admin/pelatihan/${encodeURIComponent(item.id)}`}
                  >
                    Kelola hari pelatihan
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </AdminShell>
  );
}
