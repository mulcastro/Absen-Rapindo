import { createFetchIdentityService } from './fetchAdapter';
import type { IdentityService } from './types';

export function loadIdentityService(): Promise<IdentityService> {
  return Promise.resolve(createFetchIdentityService());
}

export type * from './types';
