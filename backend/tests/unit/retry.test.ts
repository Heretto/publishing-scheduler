import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff } from '../../src/utils/retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first attempt if operation succeeds', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on network error and eventually succeed', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should retry on 5xx server errors', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn, {
      maxAttempts: 2,
      initialDelayMs: 10,
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should fail after max attempts exhausted', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      retryWithBackoff(mockFn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow('network error');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('validation error'));

    await expect(
      retryWithBackoff(mockFn, { maxAttempts: 3, initialDelayMs: 10 }),
    ).rejects.toThrow('validation error');

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should respect custom shouldRetry predicate', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('custom error'));
    const shouldRetry = (error: Error) => error.message.includes('custom');

    await expect(
      retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        shouldRetry,
      }),
    ).rejects.toThrow('custom error');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff delays', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 50,
      backoffMultiplier: 2,
    });
    const duration = Date.now() - startTime;

    // Should wait: 50ms + 100ms = 150ms minimum
    expect(duration).toBeGreaterThanOrEqual(140); // Allow some tolerance
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should cap delay at maxDelayMs', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await retryWithBackoff(mockFn, {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 100,
      backoffMultiplier: 10,
    });
    const duration = Date.now() - startTime;

    // Should cap at 100ms per retry, so max ~200ms total
    expect(duration).toBeLessThan(300);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
