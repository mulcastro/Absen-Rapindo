import type { ReactNode } from 'react';

import styles from './Ui.module.css';

interface ErrorNoticeProps {
  title?: string;
  children: ReactNode;
}

export function ErrorNotice({
  title = 'Terjadi kendala',
  children,
}: ErrorNoticeProps) {
  return (
    <section className={styles.errorNotice} role="alert">
      <span className={styles.noticeIcon} aria-hidden="true">
        !
      </span>
      <div>
        <h2>{title}</h2>
        <div>{children}</div>
      </div>
    </section>
  );
}

interface StateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function LoadingState({
  title = 'Memuat data',
  description = 'Mohon tunggu sebentar.',
}: Partial<StateProps>) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.stateSpinner} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <section className={styles.state}>
      <span className={styles.emptyIcon} aria-hidden="true">
        —
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className={styles.stateAction}>{action}</div>}
    </section>
  );
}
