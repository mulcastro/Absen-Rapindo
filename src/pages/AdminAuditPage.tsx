import { useCallback, useEffect, useState } from 'react';

import { AdminShell } from '../components/layout/AdminShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
} from '../components/ui/Feedback';
import { loadAdminService, type AuditPage } from '../services/admin';
import styles from './AdminPages.module.css';

const PAGE_SIZE = 25;

const actionLabels: Record<string, string> = {
  'session.created': 'Sesi dibuat',
  'session.opened': 'Sesi dibuka',
  'session.closed': 'Sesi ditutup',
  'participant.imported': 'Peserta diimpor',
  'participants.import': 'Peserta diimpor',
  'training.created': 'Pelatihan dibuat',
  'training.participants.imported': 'Peserta pelatihan diimpor',
  'training.invites.issued': 'Undangan diterbitkan',
};

export function AdminAuditPage() {
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      setData(await (await loadAdminService()).listAudit(offset, PAGE_SIZE));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Riwayat aktivitas gagal dimuat.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    setChecking(true);
    setError(null);
    try {
      setIntegrity((await (await loadAdminService()).verifyAudit()).valid);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Integritas riwayat gagal diperiksa.',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <AdminShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>PENGAWASAN SISTEM</p>
            <h1>Riwayat aktivitas</h1>
            <p>Telusuri tindakan penting yang dilakukan pada sistem absensi.</p>
          </div>
          <Button loading={checking} onClick={() => void verify()}>
            Periksa integritas
          </Button>
        </header>

        {integrity !== null && (
          <div className={styles.integrityCard} role="status">
            <Badge tone={integrity ? 'success' : 'failure'}>
              {integrity ? 'Integritas terverifikasi' : 'Perlu pemeriksaan'}
            </Badge>
            <p>
              {integrity
                ? 'Rangkaian catatan aktivitas tersambung dengan benar.'
                : 'Ditemukan ketidaksesuaian pada rangkaian catatan aktivitas.'}
            </p>
          </div>
        )}
        {error && (
          <ErrorNotice title="Riwayat aktivitas tidak tersedia">
            <p>{error}</p>
          </ErrorNotice>
        )}
        {loading ? (
          <LoadingState title="Memuat riwayat aktivitas" />
        ) : data?.items.length === 0 ? (
          <EmptyState
            title="Belum ada aktivitas"
            description="Aktivitas penting akan tercatat di halaman ini."
          />
        ) : (
          data && (
            <>
              <div
                className={styles.tableRegion}
                role="region"
                aria-label="Riwayat aktivitas"
                tabIndex={0}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Aktivitas</th>
                      <th>Pelaku</th>
                      <th>Sasaran</th>
                      <th>Nomor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.chainIndex}>
                        <td>
                          {new Intl.DateTimeFormat('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(item.createdAt))}
                        </td>
                        <th scope="row">
                          {actionLabels[item.action] ?? item.action}
                        </th>
                        <td>
                          {item.actorRole === 'admin'
                            ? 'Administrator'
                            : item.actorRole}
                        </td>
                        <td>{item.targetId ?? item.targetType}</td>
                        <td>#{item.chainIndex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.pagination}>
                <p>
                  Menampilkan {data.offset + 1}–
                  {Math.min(data.offset + data.items.length, data.total)} dari{' '}
                  {data.total} aktivitas
                </p>
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    disabled={data.offset === 0}
                    onClick={() =>
                      void load(Math.max(0, data.offset - PAGE_SIZE))
                    }
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    disabled={data.offset + data.items.length >= data.total}
                    onClick={() => void load(data.offset + PAGE_SIZE)}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )
        )}
      </main>
    </AdminShell>
  );
}
