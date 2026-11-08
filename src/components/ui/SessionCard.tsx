import type { ReactNode } from 'react';

import { Badge } from './Badge';
import styles from './Ui.module.css';

interface SessionCardProps {
  title: string;
  schedule: string;
  location?: string;
  status?: 'open' | 'closed';
  actions?: ReactNode;
}

export function SessionCard({
  title,
  schedule,
  location,
  status,
  actions,
}: SessionCardProps) {
  return (
    <article className={styles.sessionCard}>
      <div className={styles.sessionHeading}>
        <div>
          <h2>{title}</h2>
          <p>{schedule}</p>
        </div>
        {status && (
          <Badge tone={status === 'open' ? 'success' : 'neutral'}>
            {status === 'open' ? 'Sesi terbuka' : 'Sesi ditutup'}
          </Badge>
        )}
      </div>
      {location && <p className={styles.sessionLocation}>{location}</p>}
      {actions && <div className={styles.cardActions}>{actions}</div>}
    </article>
  );
}
