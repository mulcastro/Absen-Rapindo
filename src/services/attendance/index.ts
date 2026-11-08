import { appConfig } from '../../config/appConfig';
import { createFetchAttendanceService } from './fetchAdapter';
import type { AttendanceService } from './types';

export async function loadAttendanceService(): Promise<AttendanceService> {
  if (
    (import.meta.env.DEV || import.meta.env.MODE === 'test') &&
    appConfig.dataSource === 'mock'
  ) {
    const { createMockAttendanceService } =
      await import('../../mocks/attendanceService');
    return createMockAttendanceService();
  }
  return createFetchAttendanceService();
}

export type * from './types';
export { ServiceError } from './types';
