import type { ReactNode } from 'react';

import styles from './Ui.module.css';

export type BadgeTone = 'success' | 'warning' | 'failure' | 'neutral';

const ICONS: Record<BadgeTone, string> = {
  success: '✓',
  warning: '!',
  failure: '×',
  neutral: '•',
};

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <span className={styles.badgeIcon} aria-hidden="true">
        {ICONS[tone]}
      </span>
      {children}
    </span>
  );
}
