import type { PropsWithChildren, ReactNode } from 'react';

import { BrandLogo } from './BrandLogo';
import styles from './Shell.module.css';

interface ParticipantShellProps extends PropsWithChildren {
  title?: string;
  status?: ReactNode;
}

export function ParticipantShell({
  title = 'Absensi LPK Rapindo',
  status,
  children,
}: ParticipantShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.participantHeader}>
        <div className={styles.headerInner}>
          <BrandLogo />
          <span className={styles.participantBrand}>{title}</span>
          {status && <div className={styles.participantStatus}>{status}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}
