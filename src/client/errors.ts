/**
 * Structured error types for DeepCitation client operations.
 *
 * All errors extend DeepCitationError and include:
 * - `code` - Machine-readable error code for programmatic handling
 * - `isRetryable` - Whether the operation can be safely retried
 *
 * @packageDocumentation
 */

/**
 * Base error class for all DeepCitation errors.
 * Provides structured error codes and retryability information.
 */
export class DeepCitationError extends Error {
  /** Machine-readable error code (e.g., "DC_AUTH_INVALID", "DC_NETWORK_TIMEOUT") */
  readonly code: string;

  /** Whether the failed operation can be safely retried */
  readonly isRetryable: boolean;

  /** HTTP status code if applicable */
  readonly statusCode?: number;

  constructor(message: string, code: string, isRetryable: boolean, statusCode?: number) {
    super(message);
    this.name = "DeepCitationError";
    this.code = code;
    this.isRetryable = isRetryable;
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when the API key is missing, invalid, or expired.
 * Not retryable -- fix the API key.
 */
export class AuthenticationError extends DeepCitationError {
  constructor(message: string) {
    super(message, "DC_AUTH_INVALID", false, 401);
    this.name = "AuthenticationError";
  }
}

/**
 * Thrown when a network request fails (timeout, DNS, connection refused).
 * Safe to retry with exponential backoff.
 */
export class NetworkError extends DeepCitationError {
  constructor(message: string) {
    super(message, "DC_NETWORK_ERROR", true);
    this.name = "NetworkError";
  }
}

/**
 * Thrown when the API returns a rate limit response (429).
 * Safe to retry after the indicated delay.
 */
export class RateLimitError extends DeepCitationError {
  constructor(message: string) {
    super(message, "DC_RATE_LIMITED", true, 429);
    this.name = "RateLimitError";
  }
}

/**
 * Thrown when the request is invalid (bad input, file too large, unsupported format).
 * Not retryable -- fix the request.
 */
export class ValidationError extends DeepCitationError {
  constructor(message: string, statusCode = 400) {
    super(message, "DC_VALIDATION_ERROR", false, statusCode);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when the API returns a server error (5xx).
 * Safe to retry with exponential backoff.
 */
export class ServerError extends DeepCitationError {
  constructor(message: string, statusCode = 500) {
    super(message, "DC_SERVER_ERROR", true, statusCode);
    this.name = "ServerError";
  }
}
