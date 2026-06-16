import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import { SchedulerService } from '../../src/services/scheduler.service';

let schedulerService: SchedulerService;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  initDatabase(':memory:');
  schedulerService = new SchedulerService();
  app = createApp({ schedulerService });
});

beforeEach(() => {
  const db = getDatabase();
  db.exec('DELETE FROM job_history');
  db.exec('DELETE FROM schedules');
  schedulerService.stopAll();
});

afterAll(() => {
  schedulerService.stopAll();
  closeDatabase();
});

describe('GET /api/health', () => {
  it('returns ok status with database and scheduler checks', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.scheduler).toHaveProperty('activeJobs');
  });
});

describe('Schedules CRUD', () => {
  const validSchedule = {
    name: 'Test Schedule',
    description: 'A test schedule',
    cron_expression: '0 9 * * *',
    scenario_id: 'scenario-123',
    deployment_id: 'deployment-456',
    document_ids: ['doc-1', 'doc-2'],
    enabled: true,
  };

  it('POST /api/schedules creates a schedule and starts the cron job', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send(validSchedule);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Schedule');
    expect(res.body.cron_expression).toBe('0 9 * * *');
    expect(res.body.enabled).toBe(true);
    expect(res.body.document_ids).toEqual(['doc-1', 'doc-2']);
    expect(res.body.id).toBeDefined();

    // Verify the scheduler has the job running
    expect(schedulerService.isRunning(res.body.id)).toBe(true);
    expect(schedulerService.getActiveCount()).toBe(1);
  });

  it('POST /api/schedules with enabled=false does not start the cron job', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...validSchedule, enabled: false });

    expect(res.status).toBe(201);
    expect(res.body.enabled).toBe(false);
    expect(schedulerService.isRunning(res.body.id)).toBe(false);
    expect(schedulerService.getActiveCount()).toBe(0);
  });

  it('POST /api/schedules rejects invalid cron expressions', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...validSchedule, cron_expression: 'not-a-cron' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('POST /api/schedules validates required fields', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('POST /api/schedules validates document_ids array bounds', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({ ...validSchedule, document_ids: [''] });

    expect(res.status).toBe(400);
  });

  it('GET /api/schedules lists schedules', async () => {
    await request(app).post('/api/schedules').send(validSchedule);
    await request(app).post('/api/schedules').send({ ...validSchedule, name: 'Second' });

    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it('GET /api/schedules/:id returns a schedule', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;

    const res = await request(app).get(`/api/schedules/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe('Test Schedule');
  });

  it('GET /api/schedules/:id returns 404 for missing schedule', async () => {
    const res = await request(app).get('/api/schedules/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/schedules/:id updates a schedule and resyncs cron', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;

    expect(schedulerService.isRunning(id)).toBe(true);

    const res = await request(app)
      .put(`/api/schedules/${id}`)
      .send({ name: 'Updated Schedule', cron_expression: '*/5 * * * *' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Schedule');
    expect(res.body.cron_expression).toBe('*/5 * * * *');
    // Cron should still be running with the new expression
    expect(schedulerService.isRunning(id)).toBe(true);
  });

  it('PUT /api/schedules/:id with enabled=false stops the cron', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;
    expect(schedulerService.isRunning(id)).toBe(true);

    await request(app).put(`/api/schedules/${id}`).send({ enabled: false });
    expect(schedulerService.isRunning(id)).toBe(false);
  });

  it('PUT /api/schedules/:id returns 404 for missing', async () => {
    const res = await request(app).put('/api/schedules/nonexistent').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/schedules/:id/toggle disables and stops the cron', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;
    expect(schedulerService.isRunning(id)).toBe(true);

    const res = await request(app)
      .patch(`/api/schedules/${id}/toggle`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(schedulerService.isRunning(id)).toBe(false);
  });

  it('PATCH /api/schedules/:id/toggle enables and starts the cron', async () => {
    const createRes = await request(app)
      .post('/api/schedules')
      .send({ ...validSchedule, enabled: false });
    const id = createRes.body.id;
    expect(schedulerService.isRunning(id)).toBe(false);

    const res = await request(app)
      .patch(`/api/schedules/${id}/toggle`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(schedulerService.isRunning(id)).toBe(true);
  });

  it('PATCH /api/schedules/:id/toggle validates the enabled field', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const res = await request(app)
      .patch(`/api/schedules/${createRes.body.id}/toggle`)
      .send({ enabled: 'yes' });

    expect(res.status).toBe(400);
  });

  it('PATCH /api/schedules/:id/toggle returns 404 for missing', async () => {
    const res = await request(app)
      .patch('/api/schedules/nonexistent/toggle')
      .send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/schedules/:id deletes and stops the cron', async () => {
    const createRes = await request(app).post('/api/schedules').send(validSchedule);
    const id = createRes.body.id;
    expect(schedulerService.isRunning(id)).toBe(true);

    const res = await request(app).delete(`/api/schedules/${id}`);
    expect(res.status).toBe(204);

    expect(schedulerService.isRunning(id)).toBe(false);
    expect(schedulerService.getActiveCount()).toBe(0);

    const getRes = await request(app).get(`/api/schedules/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /api/schedules/:id returns 404 for missing', async () => {
    const res = await request(app).delete('/api/schedules/nonexistent');
    expect(res.status).toBe(404);
  });
});
