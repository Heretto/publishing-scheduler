import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import cron from 'node-cron';
import { SchedulerService } from '../../src/services/scheduler.service';
import { JobExecutorService } from '../../src/services/job-executor.service';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import * as ScheduleModel from '../../src/models/schedule.model';

beforeAll(() => {
  initDatabase(':memory:');
});

afterAll(() => {
  closeDatabase();
});

beforeEach(() => {
  const db = getDatabase();
  db.exec('DELETE FROM job_history');
  db.exec('DELETE FROM schedules');
});

describe('Cron validation', () => {
  it('validates correct cron expressions', () => {
    expect(cron.validate('0 9 * * *')).toBe(true);
    expect(cron.validate('*/5 * * * *')).toBe(true);
    expect(cron.validate('0 0 1 * *')).toBe(true);
    expect(cron.validate('0 12 * * MON-FRI')).toBe(true);
  });

  it('rejects invalid cron expressions', () => {
    expect(cron.validate('invalid')).toBe(false);
    expect(cron.validate('60 * * * *')).toBe(false);
    expect(cron.validate('')).toBe(false);
  });
});

describe('SchedulerService', () => {
  it('starts and tracks a schedule', () => {
    const executor = new JobExecutorService();
    const scheduler = new SchedulerService(executor);

    scheduler.startSchedule('test-1', '0 9 * * *');
    expect(scheduler.isRunning('test-1')).toBe(true);
    expect(scheduler.getActiveCount()).toBe(1);

    scheduler.stopAll();
  });

  it('refuses invalid cron expressions', () => {
    const scheduler = new SchedulerService();
    const result = scheduler.startSchedule('test-bad', 'not-valid');

    expect(result).toBe(false);
    expect(scheduler.isRunning('test-bad')).toBe(false);
    expect(scheduler.getActiveCount()).toBe(0);
  });

  it('stops a specific schedule', () => {
    const scheduler = new SchedulerService();
    scheduler.startSchedule('test-1', '0 9 * * *');
    scheduler.startSchedule('test-2', '0 10 * * *');
    expect(scheduler.getActiveCount()).toBe(2);

    scheduler.stopSchedule('test-1');
    expect(scheduler.isRunning('test-1')).toBe(false);
    expect(scheduler.isRunning('test-2')).toBe(true);
    expect(scheduler.getActiveCount()).toBe(1);

    scheduler.stopAll();
  });

  it('replaces existing schedule on startSchedule', () => {
    const scheduler = new SchedulerService();
    scheduler.startSchedule('test-1', '0 9 * * *');
    scheduler.startSchedule('test-1', '0 10 * * *');

    expect(scheduler.getActiveCount()).toBe(1);
    expect(scheduler.isRunning('test-1')).toBe(true);

    scheduler.stopAll();
  });

  it('stopAll clears all schedules', () => {
    const scheduler = new SchedulerService();
    scheduler.startSchedule('a', '0 9 * * *');
    scheduler.startSchedule('b', '0 10 * * *');
    scheduler.startSchedule('c', '0 11 * * *');
    expect(scheduler.getActiveCount()).toBe(3);

    scheduler.stopAll();
    expect(scheduler.getActiveCount()).toBe(0);
  });

  it('loadAllSchedules loads enabled schedules from DB', () => {
    ScheduleModel.createSchedule({
      name: 'Enabled',
      cron_expression: '0 9 * * *',
      scenario_id: 's1',
      deployment_id: 'd1',
      document_ids: [],
      enabled: true,
      description: '',
    });
    ScheduleModel.createSchedule({
      name: 'Disabled',
      cron_expression: '0 10 * * *',
      scenario_id: 's2',
      deployment_id: 'd2',
      document_ids: [],
      enabled: false,
      description: '',
    });

    const scheduler = new SchedulerService();
    scheduler.loadAllSchedules();

    expect(scheduler.getActiveCount()).toBe(1);

    scheduler.stopAll();
  });

  it('stopSchedule is safe to call for non-existent schedule', () => {
    const scheduler = new SchedulerService();
    expect(() => scheduler.stopSchedule('nonexistent')).not.toThrow();
  });
});
