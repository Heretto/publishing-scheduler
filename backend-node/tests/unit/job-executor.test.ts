import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { JobExecutorService } from '../../src/services/job-executor.service';
import { IHerettoClient } from '../../src/heretto/heretto-client.interface';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import * as ScheduleModel from '../../src/models/schedule.model';
import * as JobModel from '../../src/models/job.model';

let mockClient: IHerettoClient;

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

  mockClient = {
    getDeployments: vi.fn(),
    getScenarios: vi.fn(),
    getReleases: vi.fn(),
    triggerPublishingJob: vi.fn().mockResolvedValue({ id: 'heretto-123', status: 'queued' }),
  };
});

function createTestSchedule() {
  return ScheduleModel.createSchedule({
    name: 'Test',
    cron_expression: '0 9 * * *',
    scenario_id: 'sc-1',
    deployment_id: 'dp-1',
    document_ids: ['doc-a'],
    enabled: true,
    description: '',
  });
}

describe('JobExecutorService', () => {
  it('executes a job and records success', async () => {
    const schedule = createTestSchedule();
    const executor = new JobExecutorService(mockClient);

    const job = await executor.executeJob(schedule.id, 'manual');

    expect(job).toBeTruthy();
    expect(job!.status).toBe('completed');
    expect(job!.trigger_type).toBe('manual');
    expect(job!.heretto_job_id).toBe('heretto-123');
    expect(job!.error).toBeNull();

    expect(mockClient.triggerPublishingJob).toHaveBeenCalledWith({
      scenarioId: 'sc-1',
      deploymentId: 'dp-1',
      documentIds: ['doc-a'],
    });

    // Check schedule was updated
    const updated = ScheduleModel.getScheduleById(schedule.id);
    expect(updated!.last_run_status).toBe('success');
  });

  it('records failure when Heretto API throws', async () => {
    const schedule = createTestSchedule();
    (mockClient.triggerPublishingJob as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Connection refused'));

    const executor = new JobExecutorService(mockClient);
    const job = await executor.executeJob(schedule.id, 'scheduled');

    expect(job!.status).toBe('failed');
    expect(job!.error).toBe('Connection refused');

    const updated = ScheduleModel.getScheduleById(schedule.id);
    expect(updated!.last_run_status).toBe('failed');
  });

  it('throws for nonexistent schedule', async () => {
    const executor = new JobExecutorService(mockClient);
    await expect(executor.executeJob('nonexistent', 'manual'))
      .rejects.toThrow('Schedule nonexistent not found');
  });

  it('creates job_history entry even on failure', async () => {
    const schedule = createTestSchedule();
    (mockClient.triggerPublishingJob as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('fail'));

    const executor = new JobExecutorService(mockClient);
    await executor.executeJob(schedule.id, 'manual');

    const jobs = JobModel.getJobs({ schedule_id: schedule.id });
    expect(jobs.total).toBe(1);
    expect(jobs.data[0].status).toBe('failed');
  });
});
