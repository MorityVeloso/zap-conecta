import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreaker } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker('test', {
      failureThreshold: 3,
      windowMs: 10_000,
      cooldownMs: 5_000,
    });
  });

  // ── CLOSED state ─────────────────────────────────────

  it('starts in CLOSED state and executes functions normally', async () => {
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('propagates errors without opening when below threshold', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

    // 2 failures < threshold (3) → still CLOSED
    expect(cb.getState()).toBe('CLOSED');
  });

  // ── CLOSED → OPEN transition ─────────────────────────

  it('opens after reaching failure threshold within window', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    expect(cb.getState()).toBe('OPEN');
  });

  it('does NOT open if failures are spread outside the window', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    // Advance past the 10s window
    vi.advanceTimersByTime(11_000);

    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    // Only 1 failure in the current window — still CLOSED
    expect(cb.getState()).toBe('CLOSED');
  });

  // ── OPEN state ────────────────────────────────────────

  it('rejects immediately when OPEN (no function execution)', async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    const fn = vi.fn();
    await expect(cb.execute(fn)).rejects.toThrow(ServiceUnavailableException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('includes breaker name in error message', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(/\[test\]/);
  });

  // ── OPEN → HALF_OPEN transition ──────────────────────

  it('transitions to HALF_OPEN after cooldown expires', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(5_000);

    // Next call should be allowed (probe request)
    const result = await cb.execute(() => Promise.resolve('probe'));
    expect(result).toBe('probe');
    expect(cb.getState()).toBe('CLOSED'); // success in HALF_OPEN → CLOSED
  });

  // ── HALF_OPEN → CLOSED (success) ─────────────────────

  it('resets to CLOSED after successful probe in HALF_OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(5_000);

    await cb.execute(() => Promise.resolve('ok'));

    expect(cb.getState()).toBe('CLOSED');

    // Verify normal operation resumes
    const result = await cb.execute(() => Promise.resolve('normal'));
    expect(result).toBe('normal');
  });

  // ── HALF_OPEN → OPEN (failure) ───────────────────────

  it('goes back to OPEN if probe fails in HALF_OPEN', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    }
    vi.advanceTimersByTime(5_000);

    // Probe fails
    await expect(cb.execute(() => Promise.reject(new Error('probe-fail')))).rejects.toThrow();
    expect(cb.getState()).toBe('OPEN');

    // Should reject immediately again
    const fn = vi.fn();
    await expect(cb.execute(fn)).rejects.toThrow(ServiceUnavailableException);
    expect(fn).not.toHaveBeenCalled();
  });

  // ── Success resets failure counter ────────────────────

  it('resets failures on success', async () => {
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    // Success resets counter
    await cb.execute(() => Promise.resolve('ok'));

    // 2 more failures should NOT trigger open (counter was reset)
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

    expect(cb.getState()).toBe('CLOSED');
  });

  // ── Default options ───────────────────────────────────

  it('uses default values when no options provided', () => {
    const defaultCb = new CircuitBreaker('default');
    expect(defaultCb.getState()).toBe('CLOSED');
  });
});
