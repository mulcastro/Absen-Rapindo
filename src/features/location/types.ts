export type LocationErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'unknown';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(
    code: LocationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LocationError';
    this.code = code;
  }
}

export interface LocationCapture {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export type LocationState =
  | { status: 'idle'; capture: null; error: null }
  | { status: 'requesting'; capture: null; error: null }
  | { status: 'captured'; capture: LocationCapture; error: null }
  | { status: 'error'; capture: null; error: LocationError };
