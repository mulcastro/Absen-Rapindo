import { createFetchAttendanceService } from './fetchAdapter';
import type { AttendanceService } from './types';

export function loadAttendanceService(): Promise<AttendanceService> {
  return Promise.resolve(createFetchAttendanceService());
}

export type * from './types';
export { ServiceError } from './types';
