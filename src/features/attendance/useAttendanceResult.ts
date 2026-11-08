import { useEffect, useState } from 'react';

import {
  loadAttendanceService,
  ServiceError,
  type AttendanceSubmitResult,
} from '../../services/attendance';

type ResultState =
  | { status: 'loading'; result: null; message: null }
  | { status: 'confirmed'; result: AttendanceSubmitResult; message: null }
  | { status: 'unknown' | 'unavailable'; result: null; message: string };

export function useAttendanceResult(attemptId: string): ResultState {
  const [state, setState] = useState<ResultState>({
    status: 'loading',
    result: null,
    message: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void loadAttendanceService()
      .then((service) =>
        service.reconcileAttendance(attemptId, controller.signal),
      )
      .then((response) => {
        if (!active) return;
        if (response.status === 'confirmed') {
          setState({
            status: 'confirmed',
            result: response.result,
            message: null,
          });
        } else {
          setState({
            status: 'unknown',
            result: null,
            message:
              'Hasil belum ditemukan. Jangan mengulang absensi otomatis.',
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const unavailable =
          error instanceof ServiceError &&
          error.code === 'reconciliation-unavailable';
        setState({
          status: unavailable ? 'unavailable' : 'unknown',
          result: null,
          message: unavailable
            ? 'Endpoint pemeriksaan ulang hasil belum disepakati. Hasil tidak dapat dipulihkan setelah reload.'
            : 'Hasil absensi belum dapat dipastikan.',
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attemptId]);

  return state;
}
