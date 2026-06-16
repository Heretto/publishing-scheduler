import { createApp } from './app';
import { config, validateConfig } from './config';
import { initDatabase, closeDatabase } from './db/database';
import { SchedulerService } from './services/scheduler.service';
import { pruneOldJobs } from './models/job.model';
import { logger } from './logger';

const warnings = validateConfig();
for (const w of warnings) {
  logger.warn(w);
}

initDatabase();
logger.info('Database initialized');

const schedulerService = new SchedulerService();
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

function shutdown(signal: string) {
  logger.info('Shutdown signal received', { signal });

  clearInterval(pruneTimer);
  schedulerService.stopAll();
  logger.info('Scheduler stopped');

  server.close(() => {
    closeDatabase();
    logger.info('Server shut down');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
