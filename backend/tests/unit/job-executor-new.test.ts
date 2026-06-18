import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobExecutorService } from '../../src/services/job-executor.service';
import type { IHerettoClient } from '../../src/heretto/heretto-client.interface';
import * as JobModel from '../../src/models/job.model';
import * as ScheduleModel from '../../src/models/schedule.model';

// Mock dependencies
vi.mock('../../src/models/job.model');
vi.mock('../../src/models/schedule.model');
vi.mock('../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../src/metrics', () => ({
  jobExecutionDuration: { observe: vi.fn() },
  jobExecutionTotal: { inc: vi.fn() },
  jobConcurrentExecutions: { inc: vi.fn(), dec: vi.fn() },
}));

describe('JobExecutorService', () => {
  let service: JobExecutorService;
  let mockHerettoClient: IHerettoClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockHerettoClient = {
      triggerPublishingJob: vi.fn(),
      getDeployments: vi.fn(),
      getScenarios: vi.fn(),
      getReleases: vi.fn(),
      getScenarioParameters: vi.fn(),
    };

    service = new JobExecutorService(mockHerettoClient);
  });

  describe('executeJob', () => {
    it('should execute job successfully', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        scenario_id: '123',
        deployment_id: 'dep-1',
        document_ids: ['doc-1', 'doc-2'],
        publish_parameters: [],
        enabled: true,
        consecutive_failures: 0,
      };

      const mockJob = {
        id: 'job-1',
        schedule_id: 'schedule-1',
        status: 'running',
        trigger_type: 'manual',
      };

      const mockResults = [
        { id: '1', status: 'submitted', fileId: 'doc-1' },
        { id: '2', status: 'submitted', fileId: 'doc-2' },
      ];

      vi.mocked(ScheduleModel.getScheduleById).mockReturnValue(mockSchedule as any);
      vi.mocked(JobModel.createJob).mockReturnValue(mockJob as any);
      vi.mocked(JobModel.getJobById).mockReturnValue({ ...mockJob, status: 'completed' } as any);
      vi.mocked(mockHerettoClient.triggerPublishingJob).mockResolvedValue(mockResults as any);

      const result = await service.executeJob('schedule-1', 'manual');

      expect(result?.status).toBe('completed');
      expect(JobModel.createJob).toHaveBeenCalled();
      expect(JobModel.updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed',
        heretto_job_id: '1,2',
      }));
      expect(ScheduleModel.updateScheduleLastRun).toHaveBeenCalledWith('schedule-1', 'success');
    });

    it('should prevent concurrent execution of same schedule', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        scenario_id: '123',
        deployment_id: 'dep-1',
        document_ids: ['doc-1'],
        publish_parameters: [],
        enabled: true,
        consecutive_failures: 0,
      };

      vi.mocked(ScheduleModel.getScheduleById).mockReturnValue(mockSchedule as any);
      vi.mocked(JobModel.createJob).mockReturnValue({ id: 'job-1' } as any);
      vi.mocked(mockHerettoClient.triggerPublishingJob).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([] as any), 100))
      );

      // Start first job
      const firstJob = service.executeJob('schedule-1', 'manual');

      // Try to start second job while first is running
      await expect(service.executeJob('schedule-1', 'manual'))
        .rejects.toThrow('Job for schedule schedule-1 is already running');

      await firstJob;
    });

    it('should handle job failure and update status', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        scenario_id: '123',
        deployment_id: 'dep-1',
        document_ids: ['doc-1'],
        publish_parameters: [],
        enabled: true,
        consecutive_failures: 0,
      };

      const mockJob = { id: 'job-1', status: 'running' };

      vi.mocked(ScheduleModel.getScheduleById).mockReturnValue(mockSchedule as any);
      vi.mocked(JobModel.createJob).mockReturnValue(mockJob as any);
      vi.mocked(JobModel.getJobById).mockReturnValue({ ...mockJob, status: 'failed' } as any);
      vi.mocked(mockHerettoClient.triggerPublishingJob).mockRejectedValue(
        new Error('API error')
      );

      const result = await service.executeJob('schedule-1', 'manual');

      expect(result?.status).toBe('failed');
      expect(JobModel.updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'failed',
        error: 'API error',
      }));
      expect(ScheduleModel.updateScheduleLastRun).toHaveBeenCalledWith('schedule-1', 'failed');
    });

    it('should throw error if schedule not found', async () => {
      vi.mocked(ScheduleModel.getScheduleById).mockReturnValue(null);

      await expect(service.executeJob('nonexistent', 'manual'))
        .rejects.toThrow('Schedule nonexistent not found');
    });

    it('should release lock even if job fails', async () => {
      const mockSchedule = {
        id: 'schedule-1',
        scenario_id: '123',
        deployment_id: 'dep-1',
        document_ids: ['doc-1'],
        publish_parameters: [],
        enabled: true,
        consecutive_failures: 0,
      };

      vi.mocked(ScheduleModel.getScheduleById).mockReturnValue(mockSchedule as any);
      vi.mocked(JobModel.createJob).mockReturnValue({ id: 'job-1' } as any);
      vi.mocked(JobModel.getJobById).mockReturnValue({ id: 'job-1', status: 'failed' } as any);
      vi.mocked(mockHerettoClient.triggerPublishingJob).mockRejectedValue(
        new Error('API error')
      );

      await service.executeJob('schedule-1', 'manual');

      // Lock should be released
      expect(service.isJobRunning('schedule-1')).toBe(false);
    });
  });

  describe('isJobRunning', () => {
    it('should return false for non-running job', () => {
      expect(service.isJobRunning('schedule-1')).toBe(false);
    });
  });

  describe('getRunningJobsCount', () => {
    it('should return 0 when no jobs running', () => {
      expect(service.getRunningJobsCount()).toBe(0);
    });
  });
});
