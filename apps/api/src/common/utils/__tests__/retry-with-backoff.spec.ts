import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff } from '../retry-with-backoff';
import { EvolutionApiException } from '../../exceptions/evolution-api.exception';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // ── Success on first attempt ──────────────────────────

  it('returns result immediately when function succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Retries on retryable errors ───────────────────────

  it('retries on TypeError (network error) and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('recovered');

    const promise = retryWithBackoff(fn, { baseDelayMs: 100 });
    // Advance past the jittered delay
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on Evolution API 5xx errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new EvolutionApiException(500, 'Internal Server Error'))
      .mockRejectedValueOnce(new EvolutionApiException(502, 'Bad Gateway'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on DOMException TimeoutError', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ── No retry on non-retryable errors ──────────────────

  it('does NOT retry on Evolution API 4xx errors', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new EvolutionApiException(400, 'Bad Request'));

    await expect(retryWithBackoff(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on generic Error', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new Error('business logic error'));

    await expect(retryWithBackoff(fn)).rejects.toThrow('business logic error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on Evolution API 401', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new EvolutionApiException(401, 'Unauthorized'));

    await expect(retryWithBackoff(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on Evolution API 404', async () => {
    const fn = vi.fn()
      .mockRejectedValue(new EvolutionApiException(404, 'Not Found'));

    await expect(retryWithBackoff(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Exhausted attempts ────────────────────────────────

  it('throws last error after exhausting all attempts', async () => {
    vi.useRealTimers(); // Use real timers for this test (short delays)

    const fn = vi.fn()
      .mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 }),
    ).rejects.toThrow('fetch failed');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ── Custom retry logic ────────────────────────────────

  it('respects custom isRetryable predicate', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('custom-retryable'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      isRetryable: (err) => err instanceof Error && err.message === 'custom-retryable',
    });
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('respects maxAttempts option', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fail'));

    const promise = retryWithBackoff(fn, { maxAttempts: 1, baseDelayMs: 100 });
    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ── Delay behavior ────────────────────────────────────

  it('delays increase with each attempt (exponential backoff)', async () => {
    vi.useRealTimers();

    const timestamps: number[] = [];
    const fn = vi.fn().mockImplementation(() => {
      timestamps.push(Date.now());
      if (timestamps.length < 3) return Promise.reject(new TypeError('fail'));
      return Promise.resolve('ok');
    });

    await retryWithBackoff(fn, { baseDelayMs: 50 });

    expect(timestamps.length).toBe(3);
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];

    // Second delay should be longer than first (exponential)
    // With jitter: delay1 = 50 * 2^0 * [0.5-1.0] = 25-50ms
    //              delay2 = 50 * 2^1 * [0.5-1.0] = 50-100ms
    expect(delay1).toBeGreaterThanOrEqual(20);
    expect(delay2).toBeGreaterThan(delay1 * 0.8); // Loose bound for jitter
  });
});
