/**
 * @module ServiceError
 * Custom error class for all service-layer failures.
 * Wraps raw IPC or fetch errors with source attribution.
 */
export class ServiceError extends Error {
  constructor(
    public readonly source: string,
    message?: string
  ) {
    super(message ?? 'An unexpected error occurred');
    this.name = 'ServiceError';
  }
}
