import { DatasetError } from './dataset-io.ts';

const errors = {
  UPSTREAM_UNAVAILABLE: {
    message: 'PEGELONLINE is currently unavailable.',
  },
  UPSTREAM_TIMEOUT: {
    message: 'PEGELONLINE did not respond in time.',
  },
  INVALID_UPSTREAM_RESPONSE: {
    message: 'PEGELONLINE returned invalid measurement data.',
  },
  MEASUREMENT_UNAVAILABLE: {
    message: 'No current water-level measurement is available for Schleswig.',
  },
  INTERNAL_ERROR: { message: 'An unexpected error occurred.' },
} as const;

export type ErrorCode = keyof typeof errors;

export class WaterLevelError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, options?: ErrorOptions) {
    super(errors[code].message, options);
    this.name = 'WaterLevelError';
    this.code = code;
  }
}

export function publicError(error: unknown) {
  if (error instanceof DatasetError) {
    const messages = {
      SOURCE_UNAVAILABLE: 'The prepared dataset is unavailable.',
      SOURCE_TIMEOUT: 'The data source did not respond in time.',
      INVALID_SOURCE_DATA: 'The prepared dataset failed validation.',
      DATA_NOT_FOUND: 'The prepared dataset is missing.',
    };
    return { error: { code: error.code, message: messages[error.code] } };
  }
  const code = error instanceof WaterLevelError ? error.code : 'INTERNAL_ERROR';
  return { error: { code, message: errors[code].message } };
}
