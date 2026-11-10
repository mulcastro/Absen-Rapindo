import { createFetchAdminService } from './fetchAdapter';
import type { AdminService } from './types';

export function loadAdminService(): Promise<AdminService> {
  return Promise.resolve(createFetchAdminService());
}

export type * from './types';
