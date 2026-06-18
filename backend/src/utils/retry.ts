import { config } from '../config';
import { logger } from '../logger';
import { jobRetries } from '../metrics';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: Error) => boolean;
  scheduleId?: string; // For metrics tracking
}

const defaultShouldRetry = (error: Error): boolean => {
  // Retry on network errors and 5xx server errors
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('socket') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('500')
  );
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = config.retry.maxAttempts,
    initialDelayMs = config.retry.initialDelayMs,
    maxDelayMs = config.retry.maxDelayMs,
    backoffMultiplier = config.retry.backoffMultiplier,
    shouldRetry = defaultShouldRetry,
    scheduleId,
  } = options;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted attempts or if error is not retryable
      if (attempt >= maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      logger.warn('Retrying after error', {
        attempt,
        maxAttempts,
        delayMs,
        error: lastError.message,
        scheduleId,
      });

      // Track retry metrics
      if (scheduleId) {
        jobRetries.inc({ schedule_id: scheduleId });
      }

      await sleep(delayMs);

      // Calculate next delay with exponential backoff
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}
