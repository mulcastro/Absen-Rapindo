import type { PropsWithChildren, ReactNode } from 'react';

import { BrandLogo } from './BrandLogo';
import styles from './Shell.module.css';

interface AdminShellProps extends PropsWithChildren {
  actions?: ReactNode;
}

export function AdminShell({ actions, children }: AdminShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeaderInner}>
          <div className={styles.adminBrandGroup}>
            <BrandLogo />
            <span className={styles.adminBrand}>Rekap Absensi</span>
          </div>
          {actions && <div className={styles.adminActions}>{actions}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}
