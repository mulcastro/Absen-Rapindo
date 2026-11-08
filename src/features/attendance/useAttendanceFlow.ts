import { useCallback, useEffect, useRef, useState } from 'react';

import type { CapturedFrame } from '../camera/types';
import type { LocationCapture } from '../location/types';
import {
  loadAttendanceService,
  ServiceError,
  type AttendanceService,
  type AttendanceSubmitResult,
} from '../../services/attendance';

export type AttendancePhase =
  | 'preparing'
  | 'ready'
  | 'starting'
  | 'capturing'
  | 'submitting'
  | 'accepted'
  | 'rejected'
  | 'unknown';

interface FlowState {
  phase: AttendancePhase;
  message: string | null;
  result: AttendanceSubmitResult | null;
}

const INITIAL_STATE: FlowState = {
  phase: 'preparing',
  message: null,
  result: null,
};

interface RunOptions {
  sessionId: string;
  location: LocationCapture | null;
  capture: (config: {
    frameCount: number;
    durationMs: number;
    jpegQuality: number;
  }) => Promise<readonly CapturedFrame[]>;
  onConfirmed: (attemptId: string) => void;
}

export function useAttendanceFlow(
  scopeKey: string,
  serviceLoader: () => Promise<AttendanceService> = loadAttendanceService,
) {
  const [state, setState] = useState<FlowState>(INITIAL_STATE);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    runningRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => reset(), [reset, scopeKey]);

  const markReady = useCallback(() => {
    setState((current) =>
      current.phase === 'preparing' ? { ...current, phase: 'ready' } : current,
    );
  }, []);

  const run = useCallback(
    async ({ sessionId, location, capture, onConfirmed }: RunOptions) => {
      if (runningRef.current || state.phase !== 'ready') return;
      runningRef.current = true;
      const clientRequestId = crypto.randomUUID();
      let submitStarted = false;
      try {
        const service = await serviceLoader();
        setState({ phase: 'starting', message: null, result: null });
        const attempt = await service.startAttendance(
          sessionId,
          clientRequestId,
        );
        setState({ phase: 'capturing', message: null, result: null });
        const frames = await capture({
          frameCount: attempt.capture.frameCount,
          durationMs: attempt.capture.durationMs,
          jpegQuality: 0.86,
        });
        submitStarted = true;
        setState({ phase: 'submitting', message: null, result: null });
        const result = await service.submitAttendance({
          attempt,
          clientRequestId,
          sessionId,
          location,
          frames,
        });
        if (result.outcome === 'rejected') {
          setState({ phase: 'rejected', message: result.message, result });
          return;
        }
        setState({ phase: 'accepted', message: null, result });
        onConfirmed(attempt.attemptId);
      } catch (error) {
        const serviceError = error instanceof ServiceError ? error : null;
        if (
          submitStarted &&
          (!serviceError ||
            serviceError.code === 'network' ||
            serviceError.code === 'timeout')
        ) {
          setState({
            phase: 'unknown',
            message:
              'Hasil absensi belum dapat dipastikan. Jangan mengirim ulang sebelum status dapat direkonsiliasi.',
            result: null,
          });
        } else {
          setState({
            phase: 'rejected',
            message:
              serviceError?.message ??
              'Proses absensi tidak dapat dilanjutkan.',
            result: null,
          });
        }
      } finally {
        runningRef.current = false;
      }
    },
    [serviceLoader, state.phase],
  );

  return { state, markReady, run, reset };
}
