import { useRef, useState, type ChangeEvent } from 'react';

import { AdminShell } from '../components/layout/AdminShell';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { parseParticipantCsv } from '../features/admin/adminModel';
import { loadAdminService, type CsvPreviewRow } from '../services/admin';
import styles from './AdminPages.module.css';

export function AdminParticipantsPage() {
  const [rows, setRows] = useState<readonly CsvPreviewRow[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busyRef = useRef(false);

  const readCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFeedback(null);
    setRows([]);
    if (!file) return;
    setReading(true);
    try {
      setRows(parseParticipantCsv(await file.text()));
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'CSV tidak dapat dibaca.',
      );
    } finally {
      setReading(false);
      event.target.value = '';
    }
  };

  const run = async (action: () => Promise<string>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(await action());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Tindakan gagal.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const importRows = () =>
    run(async () => {
      const service = await loadAdminService();
      const result = await service.importParticipants(rows);
      return `${result.accepted} peserta berhasil diproses.`;
    });

  const invite = (row: CsvPreviewRow, purpose: 'enroll' | 'reenroll') =>
    run(async () => {
      const service = await loadAdminService();
      const result = await service.issueInvite(row.participantCode, purpose);
      if (result.token) {
        const link = `${window.location.origin}/daftar/${encodeURIComponent(result.token)}`;
        return `Undangan ${row.participantName} berlaku sampai ${result.expiresAt}. Salin sekarang: ${link}`;
      }
      return `Undangan ${purpose === 'reenroll' ? 'pendaftaran ulang' : 'pendaftaran wajah'} untuk ${row.participantName} berhasil dibuat.`;
    });

  return (
    <AdminShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>DATA PESERTA</p>
            <h1>Peserta dan undangan</h1>
            <p>Impor daftar peserta lalu terbitkan tautan pendaftaran wajah.</p>
          </div>
        </header>
        <section className={styles.card}>
          <h2>Impor daftar peserta</h2>
          <p>
            Unggah berkas CSV dengan kolom <code>kode,nama</code>. Data akan
            ditampilkan untuk diperiksa sebelum disimpan.
          </p>
          <label htmlFor="participant-csv">Pilih berkas CSV peserta</label>
          <input
            id="participant-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void readCsv(event)}
          />
        </section>
        {feedback && (
          <ErrorNotice title="Informasi peserta">
            <p>{feedback}</p>
          </ErrorNotice>
        )}
        {reading ? (
          <LoadingState title="Membaca CSV" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada pratinjau"
            description="Pilih CSV untuk memeriksa baris sebelum dikirim."
          />
        ) : (
          <>
            <div
              className={styles.tableRegion}
              role="region"
              aria-label="Pratinjau peserta"
              tabIndex={0}
            >
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Undangan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.participantCode}>
                      <td>{row.participantCode}</td>
                      <th scope="row">{row.participantName}</th>
                      <td>
                        <Button
                          loading={busy}
                          onClick={() => void invite(row, 'enroll')}
                        >
                          Terbitkan
                        </Button>{' '}
                        <Button
                          variant="outline"
                          loading={busy}
                          onClick={() => void invite(row, 'reenroll')}
                        >
                          Daftar ulang
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button loading={busy} onClick={() => void importRows()}>
              Simpan peserta
            </Button>
          </>
        )}
      </main>
    </AdminShell>
  );
}
