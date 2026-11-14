import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { Button } from '../ui/Button';
import { useAuth } from '../../features/auth/authContextValue';
import { BrandLogo } from './BrandLogo';
import styles from './Shell.module.css';

interface AdminShellProps extends PropsWithChildren {
  actions?: ReactNode;
}

export function AdminShell({ actions, children }: AdminShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const showNavigation = location.pathname !== '/admin/masuk';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      void navigate('/admin/masuk', { replace: true });
    }
  };
  return (
    <div className={styles.shell}>
      <header className={styles.adminHeader}>
        <div className={styles.adminHeaderInner}>
          <div className={styles.adminBrandGroup}>
            <BrandLogo />
            <span className={styles.adminBrand}>Rekap Absensi</span>
          </div>
          <div className={styles.adminHeaderControls}>
            {showNavigation && (
              <nav
                className={styles.adminNavigation}
                aria-label="Navigasi admin"
              >
                <NavLink
                  to="/admin/pelatihan"
                  className={({ isActive }) =>
                    isActive ? styles.adminNavActive : undefined
                  }
                >
                  Pelatihan
                </NavLink>
                <NavLink
                  to="/admin/audit"
                  className={({ isActive }) =>
                    isActive ? styles.adminNavActive : undefined
                  }
                >
                  Aktivitas
                </NavLink>
              </nav>
            )}
            {actions && <div className={styles.adminActions}>{actions}</div>}
            {showNavigation && (
              <Button
                className={styles.logoutButton}
                variant="outline"
                loading={loggingOut}
                loadingLabel="Keluar…"
                onClick={() => void handleLogout()}
              >
                Keluar
              </Button>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
