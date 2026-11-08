import { useCallback, useEffect, useRef, useState } from 'react';

import { requestLocation, type LocationRequest } from './locationService';
import { mapLocationError } from './locationService';
import type { LocationState } from './types';

const INITIAL_STATE: LocationState = {
  status: 'idle',
  capture: null,
  error: null,
};

export function useLocationCapture(scopeKey: string) {
  const requestRef = useRef<LocationRequest | null>(null);
  const mountedRef = useRef(true);
  const [state, setState] = useState<LocationState>(INITIAL_STATE);

  const reset = useCallback(() => {
    requestRef.current?.cancel();
    requestRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const capture = useCallback(async () => {
    requestRef.current?.cancel();
    setState({ status: 'requesting', capture: null, error: null });
    const request = requestLocation();
    requestRef.current = request;
    try {
      const result = await request.promise;
      if (mountedRef.current && requestRef.current === request) {
        setState({ status: 'captured', capture: result, error: null });
      }
      return result;
    } catch (error) {
      if (mountedRef.current && requestRef.current === request) {
        setState({
          status: 'error',
          capture: null,
          error: mapLocationError(error),
        });
      }
      throw error;
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  }, []);

  useEffect(() => {
    reset();
  }, [reset, scopeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.cancel();
      requestRef.current = null;
    };
  }, []);

  return { state, capture, reset };
}
