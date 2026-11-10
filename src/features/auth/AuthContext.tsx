import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  loadIdentityService,
  type AuthSession,
  type LoginInput,
} from '../../services/identity';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    void loadIdentityService()
      .then((service) => service.restore())
      .then((restored) => active && setSession(restored))
      .catch(() => active && setSession(null))
      .finally(() => active && setRestoring(false));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const service = await loadIdentityService();
    const result = await service.login(input);
    setSession(result);
    return result;
  }, []);

  const logout = useCallback(async () => {
    setSession(null);
    const service = await loadIdentityService();
    await service.logout();
  }, []);

  const value = useMemo(
    () => ({ session, restoring, login, logout }),
    [session, restoring, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
