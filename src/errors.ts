const errors = {
  UPSTREAM_UNAVAILABLE: {
    status: 502,
    message: 'PEGELONLINE is currently unavailable.',
  },
  UPSTREAM_TIMEOUT: {
    status: 504,
    message: 'PEGELONLINE did not respond in time.',
  },
  INVALID_UPSTREAM_RESPONSE: {
    status: 502,
    message: 'PEGELONLINE returned invalid measurement data.',
  },
  MEASUREMENT_UNAVAILABLE: {
    status: 503,
    message: 'No current water-level measurement is available for Schleswig.',
  },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
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
  const code = error instanceof WaterLevelError ? error.code : 'INTERNAL_ERROR';
  return {
    status: errors[code].status,
    body: { error: { code, message: errors[code].message } },
  };
}
