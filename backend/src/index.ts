import { createApp } from './app';
import { config, validateConfig } from './config';
import { initDatabase, closeDatabase } from './db/database';
import { SchedulerService } from './services/scheduler.service';
import { JobExecutorService } from './services/job-executor.service';
import { pruneOldJobs } from './models/job.model';
import { logger } from './logger';

const warnings = validateConfig();
for (const w of warnings) {
  logger.warn(w);
}

initDatabase();
logger.info('Database initialized');

const jobExecutor = new JobExecutorService();
const schedulerService = new SchedulerService(jobExecutor);
schedulerService.loadAllSchedules();

const app = createApp({ schedulerService });

const server = app.listen(config.port, () => {
  logger.info('Server started', { port: config.port, env: config.nodeEnv });
});

// Prune old jobs daily
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const pruneTimer = setInterval(() => {
  try {
    const deleted = pruneOldJobs(90);
    if (deleted > 0) {
      logger.info('Pruned old jobs', { deleted });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to prune jobs', { error: message });
  }
}, PRUNE_INTERVAL_MS);

async function shutdown(signal: string) {
  logger.info('Shutdown signal received', { signal });

  clearInterval(pruneTimer);

  // Stop accepting new scheduled jobs
  schedulerService.stopAll();
  logger.info('Scheduler stopped - no new jobs will be scheduled');

  // Wait for in-flight jobs to complete
  const shutdownTimeout = 30000; // 30 seconds
  const checkInterval = 500; // 500ms
  const maxChecks = shutdownTimeout / checkInterval;
  let checks = 0;

  while (jobExecutor.getRunningJobsCount() > 0 && checks < maxChecks) {
    const runningCount = jobExecutor.getRunningJobsCount();
    logger.info('Waiting for in-flight jobs to complete', { runningJobs: runningCount });
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    checks++;
  }

  if (jobExecutor.getRunningJobsCount() > 0) {
    logger.warn('Forcing shutdown with jobs still running', {
      runningJobs: jobExecutor.getRunningJobsCount(),
    });
  } else {
    logger.info('All jobs completed successfully');
  }

  // Close HTTP server
  server.close(() => {
    closeDatabase();
    logger.info('Server shut down gracefully');
    process.exit(0);
  });

  // Force exit after additional timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
