import { createContext, useContext } from 'react';

import type { AuthSession, LoginInput } from '../../services/identity';

export interface AuthValue {
  session: AuthSession | null;
  restoring: boolean;
  login: (input: LoginInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  return value;
}
