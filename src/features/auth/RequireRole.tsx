import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { ErrorNotice, LoadingState } from '../../components/ui/Feedback';
import type { UserRole } from '../../services/identity';
import { useAuth } from './authContextValue';

export function RequireRole({
  roles,
  children,
  loginPath,
}: {
  roles: readonly UserRole[];
  children: ReactNode;
  loginPath?: string;
}) {
  const { session, restoring } = useAuth();
  const location = useLocation();
  if (restoring) return <LoadingState title="Memulihkan sesi" />;
  if (!session || !roles.includes(session.role)) {
    if (!session && loginPath) {
      return (
        <Navigate
          replace
          to={loginPath}
          state={{ returnTo: `${location.pathname}${location.search}` }}
        />
      );
    }
    return (
      <ErrorNotice title="Akses memerlukan login">
        <p>Akun Anda tidak memiliki izin untuk membuka halaman ini.</p>
      </ErrorNotice>
    );
  }
  return children;
}
