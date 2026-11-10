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

export function useAttendanceResult(attemptId: string) {
  const [state, setState] = useState<ResultState>({
    status: 'loading',
    result: null,
    message: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);

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
            message: 'Hasil masih diproses. Jangan melakukan absensi ulang.',
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
            ? 'Status absensi belum dapat diperiksa saat ini. Silakan coba kembali.'
            : 'Hasil absensi belum dapat dipastikan. Periksa kembali saat koneksi stabil.',
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attemptId, refreshKey]);

  return {
    ...state,
    refresh: () => setRefreshKey((current) => current + 1),
  };
}
