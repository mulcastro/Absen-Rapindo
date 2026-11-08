import type { DemoSession } from '../visual-demo/types';

export function applyDevelopmentSessionState(
  session: DemoSession,
  search: string,
): DemoSession {
  if (!import.meta.env.DEV) return session;
  const requested = new URLSearchParams(search).get('session');
  if (requested === 'closed' || requested === 'expired') {
    return { ...session, status: requested };
  }
  if (requested === 'unknown') return { ...session, status: 'unknown' };
  if (requested === 'optional') {
    return { ...session, status: 'open', geoRequired: false };
  }
  return session;
}
