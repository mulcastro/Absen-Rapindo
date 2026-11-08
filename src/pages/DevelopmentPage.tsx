import type { ReactNode } from 'react';

import { AdminShell } from '../components/layout/AdminShell';
import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/Feedback';
import { appConfig } from '../config/appConfig';
import styles from './DevelopmentPage.module.css';

interface DevelopmentPageProps {
  audience: 'Peserta' | 'Admin';
  title: string;
  description: string;
}

function withShell(audience: 'Peserta' | 'Admin', content: ReactNode) {
  return audience === 'Admin' ? (
    <AdminShell>{content}</AdminShell>
  ) : (
    <ParticipantShell>{content}</ParticipantShell>
  );
}

export function DevelopmentPage({
  audience,
  title,
  description,
}: DevelopmentPageProps) {
  return withShell(
    audience,
    <>
      <main className={styles.main}>
        {appConfig.dataSource === 'mock' && (
          <p className={styles.mockNotice} role="status">
            Mode simulasi — data tidak dikirim ke server
          </p>
        )}
        <section className={styles.card} aria-labelledby="page-title">
          <div className={styles.introRow}>
            <p className={styles.eyebrow}>Tahap sistem desain</p>
            <Badge tone="neutral">Dalam pengembangan</Badge>
          </div>
          <h1 id="page-title">{title}</h1>
          <p>{description}</p>
        </section>
        <EmptyState
          title="Belum ada data untuk ditampilkan"
          description="Data akan tersedia setelah fitur dan layanan terkait diterapkan."
        />
      </main>
    </>,
  );
}
