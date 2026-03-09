import { EvolutionApiException } from '../exceptions/evolution-api.exception';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

function isRetryableByDefault(error: unknown): boolean {
  // Network errors (fetch failures, DNS, etc.)
  if (error instanceof TypeError) return true;
  // Timeouts
  if (error instanceof DOMException && error.name === 'TimeoutError') return true;
  // Evolution API 5xx
  if (error instanceof EvolutionApiException && error.upstreamStatus >= 500) return true;
  return false;
}

function jitteredDelay(baseMs: number, attempt: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.min(jitter, 30_000); // cap at 30s
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const isRetryable = options?.isRetryable ?? isRetryableByDefault;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts - 1 || !isRetryable(error)) {
        throw error;
      }

      const delay = jitteredDelay(baseDelayMs, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
