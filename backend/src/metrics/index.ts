import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a Registry which registers the metrics
export const register = new Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'publishing-scheduler',
});

// Enable the collection of default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// HTTP Request Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // 10ms to 10s
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
});

// Job Execution Metrics
export const jobExecutionDuration = new Histogram({
  name: 'job_execution_duration_seconds',
  help: 'Duration of job execution in seconds',
  labelNames: ['schedule_id', 'trigger_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600], // 1s to 10min
  registers: [register],
});

export const jobExecutionTotal = new Counter({
  name: 'job_executions_total',
  help: 'Total number of job executions',
  labelNames: ['schedule_id', 'trigger_type', 'status'],
  registers: [register],
});

export const jobRetries = new Counter({
  name: 'job_retries_total',
  help: 'Total number of job retry attempts',
  labelNames: ['schedule_id'],
  registers: [register],
});

export const jobConcurrentExecutions = new Gauge({
  name: 'job_concurrent_executions',
  help: 'Number of jobs currently executing',
  registers: [register],
});

// Scheduler Metrics
export const activeSchedules = new Gauge({
  name: 'scheduler_active_schedules',
  help: 'Number of active scheduled jobs',
  registers: [register],
});

export const scheduleFailures = new Counter({
  name: 'schedule_failures_total',
  help: 'Total number of schedule failures',
  labelNames: ['schedule_id', 'reason'],
  registers: [register],
});

export const scheduleDisabled = new Counter({
  name: 'schedules_auto_disabled_total',
  help: 'Total number of schedules auto-disabled due to failures',
  labelNames: ['schedule_id'],
  registers: [register],
});

// Database Metrics
export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], // 1ms to 1s
  registers: [register],
});

export const databaseErrors = new Counter({
  name: 'database_errors_total',
  help: 'Total number of database errors',
  labelNames: ['operation', 'error_type'],
  registers: [register],
});

// Rate Limiting Metrics
export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits (blocked requests)',
  labelNames: ['limiter_type'],
  registers: [register],
});

// Helper function to track async operations
export function trackAsyncOperation<T>(
  histogram: Histogram,
  labels: Record<string, string | number>,
  operation: () => Promise<T>,
): Promise<T> {
  const end = histogram.startTimer(labels);
  return operation().finally(() => end());
}
