import { ServiceUnavailableException } from '@nestjs/common';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 30_000;
const DEFAULT_COOLDOWN_MS = 30_000;

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures: number[] = [];
  private openedAt = 0;

  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor(private readonly name: string, options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new ServiceUnavailableException(
          `Circuit breaker [${this.name}] is OPEN — Evolution API temporarily unavailable`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
    }
    this.failures = [];
  }

  private onFailure(): void {
    const now = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.openedAt = now;
      return;
    }

    this.failures.push(now);
    this.failures = this.failures.filter((t) => now - t < this.windowMs);

    if (this.failures.length >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = now;
      this.failures = [];
    }
  }

  getState(): string {
    return this.state;
  }
}
