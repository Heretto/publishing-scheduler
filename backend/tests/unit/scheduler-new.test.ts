import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchedulerService } from '../../src/services/scheduler.service';
import { JobExecutorService } from '../../src/services/job-executor.service';
import * as ScheduleModel from '../../src/models/schedule.model';

// Mock dependencies
vi.mock('../../src/models/schedule.model');
vi.mock('../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../src/metrics', () => ({
  activeSchedules: { set: vi.fn() },
  scheduleFailures: { inc: vi.fn() },
  scheduleDisabled: { inc: vi.fn() },
}));
vi.mock('../../src/config', () => ({
  config: {
    scheduler: {
      maxConsecutiveFailures: 5,
    },
  },
}));

describe('SchedulerService', () => {
  let service: SchedulerService;
  let mockExecutor: JobExecutorService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutor = {
      executeJob: vi.fn().mockResolvedValue({}),
      isJobRunning: vi.fn(),
      getRunningJobsCount: vi.fn(),
    } as any;

    service = new SchedulerService(mockExecutor);
  });

  afterEach(() => {
    service.stopAll();
  });

  describe('loadAllSchedules', () => {
    it('should load and start enabled schedules', () => {
      const mockSchedules = [
        { id: '1', cron_expression: '* * * * *', enabled: true },
        { id: '2', cron_expression: '0 0 * * *', enabled: true },
        { id: '3', cron_expression: '0 12 * * *', enabled: false },
      ];

      vi.mocked(ScheduleModel.getAllSchedules).mockReturnValue(mockSchedules as any);

      service.loadAllSchedules();

      expect(service.getActiveCount()).toBe(2);
    });

    it('should not start disabled schedules', () => {
      const mockSchedules = [
        { id: '1', cron_expression: '* * * * *', enabled: false },
      ];

      vi.mocked(ScheduleModel.getAllSchedules).mockReturnValue(mockSchedules as any);

      service.loadAllSchedules();

      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('startSchedule', () => {
    it('should start a schedule with valid cron expression', () => {
      const result = service.startSchedule('schedule-1', '*/5 * * * *');

      expect(result).toBe(true);
      expect(service.isRunning('schedule-1')).toBe(true);
    });

    it('should reject invalid cron expression', () => {
      const result = service.startSchedule('schedule-1', 'invalid cron');

      expect(result).toBe(false);
      expect(service.isRunning('schedule-1')).toBe(false);
    });

    it('should replace existing schedule', () => {
      service.startSchedule('schedule-1', '*/5 * * * *');
      expect(service.getActiveCount()).toBe(1);

      service.startSchedule('schedule-1', '*/10 * * * *');
      expect(service.getActiveCount()).toBe(1);
    });
  });

  describe('stopSchedule', () => {
    it('should stop a running schedule', () => {
      service.startSchedule('schedule-1', '*/5 * * * *');
      expect(service.isRunning('schedule-1')).toBe(true);

      service.stopSchedule('schedule-1');
      expect(service.isRunning('schedule-1')).toBe(false);
    });

    it('should handle stopping non-existent schedule', () => {
      expect(() => service.stopSchedule('nonexistent')).not.toThrow();
    });
  });

  describe('stopAll', () => {
    it('should stop all running schedules', () => {
      service.startSchedule('schedule-1', '*/5 * * * *');
      service.startSchedule('schedule-2', '*/10 * * * *');
      expect(service.getActiveCount()).toBe(2);

      service.stopAll();
      expect(service.getActiveCount()).toBe(0);
    });
  });

  describe('isRunning', () => {
    it('should return true for running schedule', () => {
      service.startSchedule('schedule-1', '*/5 * * * *');
      expect(service.isRunning('schedule-1')).toBe(true);
    });

    it('should return false for non-running schedule', () => {
      expect(service.isRunning('schedule-1')).toBe(false);
    });
  });

  describe('getActiveCount', () => {
    it('should return correct count of active schedules', () => {
      expect(service.getActiveCount()).toBe(0);

      service.startSchedule('schedule-1', '*/5 * * * *');
      expect(service.getActiveCount()).toBe(1);

      service.startSchedule('schedule-2', '*/10 * * * *');
      expect(service.getActiveCount()).toBe(2);

      service.stopSchedule('schedule-1');
      expect(service.getActiveCount()).toBe(1);
    });
  });
});
