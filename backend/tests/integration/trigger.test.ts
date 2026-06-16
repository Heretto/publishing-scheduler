import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import { SchedulerService } from '../../src/services/scheduler.service';
import { IHerettoClient } from '../../src/heretto/heretto-client.interface';

const mockHerettoClient: IHerettoClient = {
  getDeployments: vi.fn().mockResolvedValue([{ id: 'd1', name: 'Deploy 1' }]),
  getScenarios: vi.fn().mockResolvedValue([{ id: 's1', name: 'Scenario 1' }]),
  getReleases: vi.fn().mockResolvedValue([{ id: 'r1', name: 'Release 1' }]),
  triggerPublishingJob: vi.fn().mockResolvedValue({ id: 'heretto-job-1', status: 'queued' }),
};

let schedulerService: SchedulerService;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  initDatabase(':memory:');
  schedulerService = new SchedulerService();
  app = createApp({ schedulerService, herettoClient: mockHerettoClient });
});

beforeEach(() => {
  const db = getDatabase();
  db.exec('DELETE FROM job_history');
  db.exec('DELETE FROM schedules');
  schedulerService.stopAll();
  vi.clearAllMocks();
});

afterAll(() => {
  schedulerService.stopAll();
  closeDatabase();
});

describe('POST /api/schedules/:id/trigger', () => {
  const validSchedule = {
    name: 'Trigger Test',
    cron_expression: '0 9 * * *',
    scenario_id: 'scenario-1',
    deployment_id: 'deployment-1',
    document_ids: ['doc-1'],
    enabled: true,
  };

  it('manually triggers a job and records success', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const scheduleId = createRes.body.id;

    const res = await request(app).post(`/api/schedules/${scheduleId}/trigger`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.trigger_type).toBe('manual');
    expect(res.body.schedule_id).toBe(scheduleId);
    expect(res.body.heretto_job_id).toBe('heretto-job-1');

    expect(mockHerettoClient.triggerPublishingJob).toHaveBeenCalledWith({
      scenarioId: 'scenario-1',
      deploymentId: 'deployment-1',
      documentIds: ['doc-1'],
    });
  });

  it('records failure when Heretto API rejects', async () => {
    (mockHerettoClient.triggerPublishingJob as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Heretto API error: 401 Unauthorized'));

    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const scheduleId = createRes.body.id;

    const res = await request(app).post(`/api/schedules/${scheduleId}/trigger`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toContain('Unauthorized');
  });

  it('returns 404 for missing schedule', async () => {
    const res = await request(app).post('/api/schedules/nonexistent/trigger');
    expect(res.status).toBe(404);
  });

  it('creates a job_history entry visible in the jobs list', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    await request(app).post(`/api/schedules/${createRes.body.id}/trigger`);

    const jobsRes = await request(app).get('/api/jobs');
    expect(jobsRes.body.total).toBe(1);
    expect(jobsRes.body.data[0].trigger_type).toBe('manual');
  });

  it('updates the schedule last_run_status', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;

    await request(app).post(`/api/schedules/${id}/trigger`);

    const scheduleRes = await request(app).get(`/api/schedules/${id}`);
    expect(scheduleRes.body.last_run_status).toBe('success');
    expect(scheduleRes.body.last_run_at).toBeTruthy();
  });
});

describe('GET /api/heretto/*', () => {
  it('GET /api/heretto/deployments proxies to Heretto', async () => {
    const res = await request(app).get('/api/heretto/deployments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'd1', name: 'Deploy 1' }]);
  });

  it('GET /api/heretto/scenarios proxies to Heretto', async () => {
    const res = await request(app).get('/api/heretto/scenarios');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 's1', name: 'Scenario 1' }]);
  });

  it('GET /api/heretto/releases proxies to Heretto', async () => {
    const res = await request(app).get('/api/heretto/releases');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'r1', name: 'Release 1' }]);
  });

  it('returns 500 when Heretto API fails', async () => {
    (mockHerettoClient.getDeployments as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Network error'));

    const res = await request(app).get('/api/heretto/deployments');
    expect(res.status).toBe(500);
  });
});
