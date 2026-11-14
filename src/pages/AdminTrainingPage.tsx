import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link, useParams } from 'react-router';

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
import {
  buildInviteUrl,
  copyText,
  formatInviteList,
  parseParticipantCsv,
  summarizeEnrollment,
} from '../features/admin/adminModel';
import {
  loadAdminService,
  type AdminSession,
  type CreateSessionInput,
  type CsvPreviewRow,
  type TrainingDetail,
  type UpdateSessionInput,
} from '../services/admin';
import styles from './AdminPages.module.css';

function appOrigin() {
  return window.location.origin;
}

function sessionTone(status: AdminSession['status']) {
  if (status === 'open') return 'success' as const;
  if (status === 'closed') return 'failure' as const;
  return 'neutral' as const;
}

function sessionLabel(status: AdminSession['status']) {
  if (status === 'open') return 'Terbuka';
  if (status === 'closed') return 'Ditutup';
  return 'Draf';
}

function formatRange(session: AdminSession) {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  return `${new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(start)} – ${new Intl.DateTimeFormat('id-ID', {
    timeStyle: 'short',
  }).format(end)}`;
}

const EMPTY_GEO = {
  geoRequired: false,
  latitude: '',
  longitude: '',
  radius: '',
  accuracy: '',
};

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminTrainingPage() {
  const { trainingId = '' } = useParams();
  const [training, setTraining] = useState<TrainingDetail | null>(null);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [newDayLabel, setNewDayLabel] = useState('');
  const [newDayDate, setNewDayDate] = useState('');
  const [rows, setRows] = useState<readonly CsvPreviewRow[]>([]);
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessionOneTitle, setSessionOneTitle] = useState('Sesi 1 (Pagi)');
  const [sessionTwoTitle, setSessionTwoTitle] = useState('Sesi 2 (Siang)');
  const [sessionOneStart, setSessionOneStart] = useState('');
  const [sessionOneEnd, setSessionOneEnd] = useState('');
  const [sessionTwoStart, setSessionTwoStart] = useState('');
  const [sessionTwoEnd, setSessionTwoEnd] = useState('');
  const [lateAfter, setLateAfter] = useState('15');
  const [geo, setGeo] = useState(EMPTY_GEO);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLateAfter, setEditLateAfter] = useState('15');
  const [editGeo, setEditGeo] = useState(EMPTY_GEO);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    const service = await loadAdminService();
    const data = await service.getTraining(trainingId);
    setTraining(data);
    setSelectedDayId((current) => current || data.days[0]?.id || '');
    if (data.sessions.length === 0) {
      setSessionOneStart(`${data.heldOn}T08:00`);
      setSessionOneEnd(`${data.heldOn}T12:00`);
      setSessionTwoStart(`${data.heldOn}T13:00`);
      setSessionTwoEnd(`${data.heldOn}T17:00`);
    }
    return data;
  }, [trainingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void reload()
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Pelatihan tidak dapat dimuat.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const enrollment = useMemo(
    () => summarizeEnrollment(training?.participants ?? []),
    [training],
  );
  const selectedDay = training?.days.find((day) => day.id === selectedDayId);
  const selectedDaySessions =
    training?.sessions.filter((session) => session.dayId === selectedDayId) ??
    [];

  useEffect(() => {
    if (!selectedDay || selectedDaySessions.length > 0) return;
    setSessionOneStart(`${selectedDay.heldOn}T08:00`);
    setSessionOneEnd(`${selectedDay.heldOn}T12:00`);
    setSessionTwoStart(`${selectedDay.heldOn}T13:00`);
    setSessionTwoEnd(`${selectedDay.heldOn}T17:00`);
  }, [selectedDay, selectedDaySessions.length]);

  const run = async (action: () => Promise<string>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tindakan gagal.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const readCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setRows([]);
    setError(null);
    if (!file) return;
    try {
      const parsed = parseParticipantCsv(await file.text());
      if (parsed.length === 0) {
        setError(
          'CSV tidak dapat dibaca. Gunakan header kode,nama lalu baris data.',
        );
        return;
      }
      setRows(parsed);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'CSV tidak dapat dibaca.',
      );
    } finally {
      event.target.value = '';
    }
  };

  const importRows = () =>
    run(async () => {
      const service = await loadAdminService();
      const result = await service.importTrainingParticipants(trainingId, rows);
      setRows([]);
      await reload();
      return `${result.accepted} baris diproses. Peserta baru ditambahkan dan peserta yang sudah ada tidak diduplikasi.`;
    });

  const issuePending = () =>
    run(async () => {
      const service = await loadAdminService();
      const result = await service.issueTrainingInvites(trainingId, 'enroll');
      const origin = appOrigin();
      const next: Record<string, string> = {};
      for (const invite of result.invites) {
        next[invite.participantId] = buildInviteUrl(origin, invite.token);
      }
      setInviteLinks(next);
      if (result.issued === 0) {
        return 'Semua peserta sudah memiliki wajah terdaftar.';
      }
      return `${result.issued} tautan pendaftaran siap disalin. Tautan hanya ditampilkan sekarang.`;
    });

  const copyOne = (url: string) =>
    run(async () => {
      await copyText(url);
      return 'Tautan disalin.';
    });

  const copyAll = () =>
    run(async () => {
      const list = (training?.participants ?? [])
        .map((item) =>
          inviteLinks[item.id]
            ? {
                code: item.code,
                name: item.name,
                url: inviteLinks[item.id],
              }
            : null,
        )
        .filter((item) => item !== null);
      if (list.length === 0) {
        throw new Error(
          'Terbitkan tautan terlebih dahulu, lalu salin sebelum meninggalkan halaman.',
        );
      }
      await copyText(formatInviteList(list));
      return `${list.length} tautan disalin sebagai daftar.`;
    });

  const parseGeoValues = (
    value: typeof EMPTY_GEO,
  ): Pick<
    CreateSessionInput,
    'geoRequired' | 'geoCenter' | 'geoRadiusMeters' | 'geoAccuracyMeters'
  > => {
    if (!value.geoRequired) {
      return {
        geoRequired: false,
        geoCenter: null,
        geoRadiusMeters: null,
        geoAccuracyMeters: null,
      };
    }
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    const radius = Number(value.radius);
    const accuracy = Number(value.accuracy);
    if (
      ![latitude, longitude, radius, accuracy].every(Number.isFinite) ||
      radius <= 0 ||
      accuracy <= 0
    ) {
      throw new Error(
        'Pusat koordinat, radius, dan target akurasi wajib diisi saat lokasi diwajibkan.',
      );
    }
    return {
      geoRequired: true,
      geoCenter: { latitude, longitude },
      geoRadiusMeters: radius,
      geoAccuracyMeters: accuracy,
    };
  };

  const parseGeo = () => parseGeoValues(geo);

  const beginEditSession = (session: AdminSession) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
    setEditStart(toDatetimeLocal(session.startsAt));
    setEditEnd(toDatetimeLocal(session.endsAt));
    setEditLateAfter(String(session.lateAfterMinutes));
    setEditGeo({
      geoRequired: session.geoRequired,
      latitude: session.geoCenter ? String(session.geoCenter.latitude) : '',
      longitude: session.geoCenter ? String(session.geoCenter.longitude) : '',
      radius: session.geoRadiusMeters ? String(session.geoRadiusMeters) : '',
      accuracy: session.geoAccuracyMeters
        ? String(session.geoAccuracyMeters)
        : '',
    });
  };

  const saveEditSession = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!editingSessionId) return 'Tidak ada sesi yang sedang diedit.';
      const lateAfterMinutes = Number(editLateAfter);
      if (!Number.isFinite(lateAfterMinutes) || lateAfterMinutes < 0) {
        throw new Error('Batas terlambat tidak valid.');
      }
      if (!editTitle.trim() || !editStart || !editEnd) {
        throw new Error('Judul dan waktu sesi wajib diisi.');
      }
      const input: UpdateSessionInput = {
        title: editTitle.trim(),
        startsAt: editStart,
        endsAt: editEnd,
        lateAfterMinutes,
        ...parseGeoValues(editGeo),
      };
      const service = await loadAdminService();
      await service.updateSession(editingSessionId, input);
      setEditingSessionId(null);
      await reload();
      return 'Perubahan sesi disimpan.';
    });
  };

  const createDaySessions = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const lateAfterMinutes = Number(lateAfter);
      if (!Number.isFinite(lateAfterMinutes) || lateAfterMinutes < 0) {
        throw new Error('Batas terlambat tidak valid.');
      }
      const geoInput = parseGeo();
      const service = await loadAdminService();
      if (selectedDaySessions.length === 0) {
        if (
          !sessionOneStart ||
          !sessionOneEnd ||
          !sessionTwoStart ||
          !sessionTwoEnd
        ) {
          throw new Error('Waktu Sesi 1 dan Sesi 2 wajib diisi.');
        }
        await service.createSession({
          trainingId,
          dayId: selectedDayId || null,
          title: sessionOneTitle.trim() || 'Sesi 1 (Pagi)',
          startsAt: sessionOneStart,
          endsAt: sessionOneEnd,
          lateAfterMinutes,
          ...geoInput,
        });
        await service.createSession({
          trainingId,
          dayId: selectedDayId || null,
          title: sessionTwoTitle.trim() || 'Sesi 2 (Siang)',
          startsAt: sessionTwoStart,
          endsAt: sessionTwoEnd,
          lateAfterMinutes,
          ...geoInput,
        });
      } else if (selectedDaySessions.length === 1) {
        if (!sessionTwoStart || !sessionTwoEnd) {
          throw new Error('Waktu Sesi 2 wajib diisi.');
        }
        await service.createSession({
          trainingId,
          dayId: selectedDayId || null,
          title: sessionTwoTitle.trim() || 'Sesi 2 (Siang)',
          startsAt: sessionTwoStart,
          endsAt: sessionTwoEnd,
          lateAfterMinutes,
          ...geoInput,
        });
      }
      await reload();
      return selectedDaySessions.length === 0
        ? 'Sesi 1 dan Sesi 2 disimpan.'
        : 'Sesi 2 disimpan.';
    });
  };

  const createDay = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!newDayLabel.trim() || !newDayDate) {
        throw new Error('Nama dan tanggal hari pelatihan wajib diisi.');
      }
      const service = await loadAdminService();
      const day = await service.createTrainingDay(trainingId, {
        label: newDayLabel.trim(),
        heldOn: newDayDate,
      });
      setNewDayLabel('');
      setNewDayDate('');
      setSelectedDayId(day.id);
      await reload();
      return `${day.label} ditambahkan.`;
    });
  };

  const changeStatus = (session: AdminSession) =>
    run(async () => {
      const service = await loadAdminService();
      if (session.status === 'open') {
        await service.closeSession(session.id);
        await reload();
        return `${session.title} ditutup.`;
      }
      if (session.status === 'closed') {
        throw new Error('Sesi yang sudah ditutup tidak dapat dibuka kembali.');
      }
      await service.openSession(session.id);
      await reload();
      return `${session.title} dibuka untuk absensi.`;
    });

  const exportSession = (sessionId: string, format: 'xlsx' | 'pdf') =>
    run(async () => {
      const service = await loadAdminService();
      await service.requestExport(sessionId, format);
      return `Daftar hadir ${format === 'xlsx' ? 'Excel' : 'PDF'} berhasil diunduh.`;
    });

  if (loading) {
    return (
      <AdminShell>
        <main className={styles.page}>
          <LoadingState title="Memuat hari pelatihan" />
        </main>
      </AdminShell>
    );
  }

  if (!training) {
    return (
      <AdminShell>
        <main className={styles.page}>
          <ErrorNotice title="Pelatihan tidak ditemukan">
            <p>{error ?? 'Data pelatihan tidak tersedia.'}</p>
            <p>
              <Link to="/admin/pelatihan">Kembali ke daftar pelatihan</Link>
            </p>
          </ErrorNotice>
        </main>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>HARI PELATIHAN</p>
            <h1>{training.title}</h1>
            <p>
              {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(
                new Date(`${training.heldOn}T00:00:00`),
              )}
            </p>
          </div>
          <Link className={styles.actionLink} to="/admin/pelatihan">
            Semua pelatihan
          </Link>
        </header>

        {training.days.length > 0 && (
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Hari pelatihan</h2>
                <p>
                  Roster dan enrollment tetap sama; sesi dan kehadiran dipisah
                  per hari.
                </p>
              </div>
            </div>
            <div className={styles.inlineActions}>
              {training.days.map((day) => (
                <Button
                  key={day.id}
                  variant={selectedDayId === day.id ? 'primary' : 'outline'}
                  onClick={() => setSelectedDayId(day.id)}
                >
                  {day.label}
                </Button>
              ))}
            </div>
            <form className={styles.formGrid} onSubmit={createDay}>
              <Input
                label="Nama hari baru"
                placeholder={`Hari ${training.days.length + 1}`}
                value={newDayLabel}
                onChange={(event) => setNewDayLabel(event.target.value)}
              />
              <Input
                label="Tanggal"
                type="date"
                value={newDayDate}
                onChange={(event) => setNewDayDate(event.target.value)}
              />
              <Button type="submit" loading={busy}>
                Tambah hari
              </Button>
            </form>
          </section>
        )}

        <ol className={styles.steps} aria-label="Status persiapan">
          <li>
            <span>Peserta diimpor</span>
            <strong>
              {enrollment.total > 0 ? `${enrollment.total} orang` : 'Belum'}
            </strong>
          </li>
          <li>
            <span>Wajah terdaftar</span>
            <strong>
              {enrollment.enrolled}/{enrollment.total || 0}
            </strong>
          </li>
          <li>
            <span>Jadwal sesi</span>
            <strong>
              {training.sessions.length >= 2
                ? 'Sesi 1 dan 2 siap'
                : `${training.sessions.length} / 2`}
            </strong>
          </li>
        </ol>

        {error && (
          <ErrorNotice title="Perlu perhatian">
            <p>{error}</p>
          </ErrorNotice>
        )}
        {notice && (
          <SuccessNotice title="Berhasil">
            <p>{notice}</p>
          </SuccessNotice>
        )}

        <section className={styles.card}>
          <h2>1. Peserta H−1</h2>
          <p>
            Impor CSV <code>kode,nama</code> ke pelatihan ini. Data tidak
            menyebar ke pelatihan lain.
          </p>
          <label htmlFor="training-csv">Pilih berkas CSV peserta</label>
          <input
            id="training-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void readCsv(event)}
          />
          {rows.length > 0 && (
            <>
              <div className={styles.tableRegion}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama</th>
                      <th>Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.participantCode}>
                        <td>{row.participantCode}</td>
                        <th scope="row">{row.participantName}</th>
                        <td>
                          {(() => {
                            const existing = training.participants.find(
                              (participant) =>
                                participant.code === row.participantCode,
                            );
                            if (!existing) return 'Peserta baru';
                            if (existing.name !== row.participantName) {
                              return 'Perubahan nama';
                            }
                            return 'Sudah ada';
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button loading={busy} onClick={() => void importRows()}>
                Simpan peserta ke pelatihan
              </Button>
            </>
          )}
        </section>

        <section className={styles.statsRow} aria-label="Status enroll">
          <article>
            <p>Peserta kelas</p>
            <strong>{enrollment.total}</strong>
          </article>
          <article>
            <p>Siap absen</p>
            <strong>{enrollment.enrolled}</strong>
          </article>
          <article>
            <p>Belum daftar wajah</p>
            <strong>{enrollment.pending}</strong>
          </article>
        </section>

        {training.participants.length === 0 ? (
          <EmptyState
            title="Belum ada peserta"
            description="Unggah CSV pada H−1 agar tautan pendaftaran wajah dapat diterbitkan."
          />
        ) : (
          <section className={styles.card}>
            <h2>2. Undangan pendaftaran wajah</h2>
            <p>
              Terbitkan tautan hanya untuk yang belum daftar. Salin sekarang;
              token tidak disimpan di peramban.
            </p>
            <div className={styles.inlineActions}>
              <Button loading={busy} onClick={() => void issuePending()}>
                Terbitkan tautan yang belum daftar
              </Button>
              <Button
                variant="outline"
                loading={busy}
                onClick={() => void copyAll()}
              >
                Salin semua tautan
              </Button>
            </div>
            <div className={styles.tableRegion}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Status</th>
                    <th>Tautan</th>
                  </tr>
                </thead>
                <tbody>
                  {training.participants.map((participant) => (
                    <tr key={participant.id}>
                      <td>{participant.code}</td>
                      <th scope="row">{participant.name}</th>
                      <td>
                        <Badge
                          tone={
                            participant.faceEnrolled ? 'success' : 'warning'
                          }
                        >
                          {participant.faceEnrolled
                            ? 'Siap absen'
                            : 'Belum daftar wajah'}
                        </Badge>
                      </td>
                      <td>
                        {inviteLinks[participant.id] ? (
                          <div className={styles.inviteBox}>
                            <input
                              readOnly
                              value={inviteLinks[participant.id]}
                              aria-label={`Tautan ${participant.name}`}
                            />
                            <Button
                              variant="outline"
                              loading={busy}
                              onClick={() =>
                                void copyOne(inviteLinks[participant.id])
                              }
                            >
                              Salin tautan
                            </Button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedDay && selectedDaySessions.length < 2 && (
          <form
            className={`${styles.card} ${styles.formGrid}`}
            onSubmit={createDaySessions}
          >
            <div className={`${styles.sectionHeading} ${styles.full}`}>
              <div>
                <h2>3. Jadwal {selectedDay.label}</h2>
                <p>
                  Kedua sesi memakai roster yang sama. Tidak perlu memanggil
                  peserta ulang untuk sesi siang.
                </p>
              </div>
            </div>
            <Input
              label="Judul Sesi 1"
              value={sessionOneTitle}
              onChange={(event) => setSessionOneTitle(event.target.value)}
            />
            <Input
              label="Judul Sesi 2"
              value={sessionTwoTitle}
              onChange={(event) => setSessionTwoTitle(event.target.value)}
            />
            <Input
              label="Mulai Sesi 1"
              type="datetime-local"
              value={sessionOneStart}
              onChange={(event) => setSessionOneStart(event.target.value)}
            />
            <Input
              label="Akhir Sesi 1"
              type="datetime-local"
              value={sessionOneEnd}
              onChange={(event) => setSessionOneEnd(event.target.value)}
            />
            <Input
              label="Mulai Sesi 2"
              type="datetime-local"
              value={sessionTwoStart}
              onChange={(event) => setSessionTwoStart(event.target.value)}
            />
            <Input
              label="Akhir Sesi 2"
              type="datetime-local"
              value={sessionTwoEnd}
              onChange={(event) => setSessionTwoEnd(event.target.value)}
            />
            <Input
              label="Batas terlambat (menit)"
              type="number"
              min="0"
              value={lateAfter}
              onChange={(event) => setLateAfter(event.target.value)}
            />
            <label className={`${styles.checkbox} ${styles.full}`}>
              <input
                type="checkbox"
                checked={geo.geoRequired}
                onChange={(event) =>
                  setGeo({ ...geo, geoRequired: event.target.checked })
                }
              />
              Wajibkan lokasi pada kedua sesi
            </label>
            {geo.geoRequired && (
              <>
                <Input
                  label="Latitude pusat"
                  type="number"
                  step="any"
                  value={geo.latitude}
                  onChange={(event) =>
                    setGeo({ ...geo, latitude: event.target.value })
                  }
                />
                <Input
                  label="Longitude pusat"
                  type="number"
                  step="any"
                  value={geo.longitude}
                  onChange={(event) =>
                    setGeo({ ...geo, longitude: event.target.value })
                  }
                />
                <Input
                  label="Radius (meter)"
                  type="number"
                  min="1"
                  value={geo.radius}
                  onChange={(event) =>
                    setGeo({ ...geo, radius: event.target.value })
                  }
                />
                <Input
                  label="Target akurasi (meter)"
                  type="number"
                  min="1"
                  value={geo.accuracy}
                  onChange={(event) =>
                    setGeo({ ...geo, accuracy: event.target.value })
                  }
                />
              </>
            )}
            <Button className={styles.full} type="submit" loading={busy}>
              {selectedDaySessions.length === 0
                ? 'Buat Sesi 1 dan Sesi 2'
                : 'Buat Sesi 2'}
            </Button>
          </form>
        )}

        <section className={styles.grid} aria-label="Sesi hari ini">
          {training.sessions
            .filter((session) =>
              selectedDayId ? session.dayId === selectedDayId : true,
            )
            .map((session) => (
              <article className={styles.card} key={session.id}>
                <Badge tone={sessionTone(session.status)}>
                  {sessionLabel(session.status)}
                </Badge>
                <h2>{session.title}</h2>
                <p>{formatRange(session)}</p>
                <p>
                  {session.geoRequired
                    ? 'Lokasi diwajibkan'
                    : 'Lokasi tidak diwajibkan'}
                </p>
                {session.status === 'draft' &&
                  editingSessionId === session.id && (
                    <form
                      className={styles.formGrid}
                      onSubmit={saveEditSession}
                    >
                      <Input
                        label="Judul sesi"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                      />
                      <Input
                        label="Mulai"
                        type="datetime-local"
                        value={editStart}
                        onChange={(event) => setEditStart(event.target.value)}
                      />
                      <Input
                        label="Akhir"
                        type="datetime-local"
                        value={editEnd}
                        onChange={(event) => setEditEnd(event.target.value)}
                      />
                      <Input
                        label="Batas terlambat (menit)"
                        type="number"
                        min="0"
                        value={editLateAfter}
                        onChange={(event) =>
                          setEditLateAfter(event.target.value)
                        }
                      />
                      <label className={`${styles.checkbox} ${styles.full}`}>
                        <input
                          type="checkbox"
                          checked={editGeo.geoRequired}
                          onChange={(event) =>
                            setEditGeo({
                              ...editGeo,
                              geoRequired: event.target.checked,
                            })
                          }
                        />
                        Wajibkan lokasi
                      </label>
                      {editGeo.geoRequired && (
                        <>
                          <Input
                            label="Latitude pusat"
                            type="number"
                            step="any"
                            value={editGeo.latitude}
                            onChange={(event) =>
                              setEditGeo({
                                ...editGeo,
                                latitude: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Longitude pusat"
                            type="number"
                            step="any"
                            value={editGeo.longitude}
                            onChange={(event) =>
                              setEditGeo({
                                ...editGeo,
                                longitude: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Radius (meter)"
                            type="number"
                            min="1"
                            value={editGeo.radius}
                            onChange={(event) =>
                              setEditGeo({
                                ...editGeo,
                                radius: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="Target akurasi (meter)"
                            type="number"
                            min="1"
                            value={editGeo.accuracy}
                            onChange={(event) =>
                              setEditGeo({
                                ...editGeo,
                                accuracy: event.target.value,
                              })
                            }
                          />
                        </>
                      )}
                      <div className={styles.actions}>
                        <Button type="submit" loading={busy}>
                          Simpan perubahan
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingSessionId(null)}
                        >
                          Batal
                        </Button>
                      </div>
                    </form>
                  )}
                <div className={styles.actions}>
                  {session.status === 'draft' &&
                    editingSessionId !== session.id && (
                      <Button
                        variant="outline"
                        loading={busy}
                        onClick={() => beginEditSession(session)}
                      >
                        Edit sesi
                      </Button>
                    )}
                  {session.status !== 'closed' && (
                    <Button
                      loading={busy}
                      onClick={() => void changeStatus(session)}
                    >
                      {session.status === 'open' ? 'Tutup sesi' : 'Buka sesi'}
                    </Button>
                  )}
                  <Link
                    className={styles.actionLink}
                    to={`/admin/sesi/${encodeURIComponent(session.id)}`}
                  >
                    Lihat kehadiran
                  </Link>
                  <Button
                    variant="outline"
                    loading={busy}
                    onClick={() => void exportSession(session.id, 'xlsx')}
                  >
                    Ekspor Excel
                  </Button>
                  <Button
                    variant="outline"
                    loading={busy}
                    onClick={() => void exportSession(session.id, 'pdf')}
                  >
                    Ekspor PDF
                  </Button>
                </div>
              </article>
            ))}
        </section>
      </main>
    </AdminShell>
  );
}
