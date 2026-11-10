import { useEffect, useState } from 'react';

import { loadAttendanceService } from '../../services/attendance';
import type { ParticipantSession } from '../../services/attendance/types';

type SessionState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: { session: ParticipantSession } }
  | { status: 'unavailable'; data: null }
  | { status: 'error'; data: null };

export function useParticipantSession(sessionId: string): SessionState {
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    data: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    void loadAttendanceService()
      .then((service) => service.listActiveSessions(controller.signal))
      .then((sessions) => {
        const session = sessions.find((item) => item.id === sessionId);
        setState(
          session
            ? { status: 'ready', data: { session } }
            : { status: 'unavailable', data: null },
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error', data: null });
        }
      });
    return () => controller.abort();
  }, [sessionId]);

  return state;
}
