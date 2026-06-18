import cron from 'node-cron';
import { getAllSchedules, getScheduleById, disableSchedule } from '../models/schedule.model';
import { JobExecutorService } from './job-executor.service';
import { logger } from '../logger';
import { config } from '../config';

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private executor: JobExecutorService;

  constructor(executor?: JobExecutorService) {
    this.executor = executor || new JobExecutorService();
  }

  loadAllSchedules(): void {
    this.stopAll();
    const schedules = getAllSchedules();
    for (const schedule of schedules) {
      if (schedule.enabled) {
        this.startSchedule(schedule.id, schedule.cron_expression);
      }
    }
    logger.info('Scheduler loaded', { activeCount: this.tasks.size });
  }

  startSchedule(scheduleId: string, cronExpression: string): boolean {
    this.stopSchedule(scheduleId);

    if (!cron.validate(cronExpression)) {
      logger.error('Invalid cron expression', { scheduleId, cronExpression });
      return false;
    }

    const task = cron.schedule(cronExpression, async () => {
      logger.info('Executing scheduled job', { scheduleId });
      try {
        await this.executor.executeJob(scheduleId, 'scheduled');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Scheduled job execution failed', { scheduleId, error: message });

        // Check if we should disable this schedule due to consecutive failures
        const schedule = getScheduleById(scheduleId);
        if (schedule && schedule.consecutive_failures >= config.scheduler.maxConsecutiveFailures) {
          logger.error('Disabling schedule due to consecutive failures', {
            scheduleId,
            consecutiveFailures: schedule.consecutive_failures,
            maxAllowed: config.scheduler.maxConsecutiveFailures,
          });

          disableSchedule(scheduleId, `Auto-disabled after ${schedule.consecutive_failures} consecutive failures`);
          this.stopSchedule(scheduleId);
        }
      }
    });

    this.tasks.set(scheduleId, task);
    return true;
  }

  stopSchedule(scheduleId: string): void {
    const existing = this.tasks.get(scheduleId);
    if (existing) {
      existing.stop();
      this.tasks.delete(scheduleId);
    }
  }

  stopAll(): void {
    for (const [, task] of this.tasks) {
      task.stop();
    }
    this.tasks.clear();
  }

  isRunning(scheduleId: string): boolean {
    return this.tasks.has(scheduleId);
  }

  getActiveCount(): number {
    return this.tasks.size;
  }
}
