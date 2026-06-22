import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import { v4 as uuidv4 } from 'uuid';

let app: ReturnType<typeof createApp>;
let scheduleId: string;

beforeAll(() => {
  initDatabase(':memory:');
  app = createApp();
});

beforeEach(() => {
  const db = getDatabase();
  db.exec('DELETE FROM job_history');
  db.exec('DELETE FROM schedules');

  scheduleId = uuidv4();
  db.prepare(`
    INSERT INTO schedules (id, name, cron_expression, scenario_id, deployment_id, created_at, updated_at)
    VALUES (?, 'Test', '0 9 * * *', 's1', 'd1', datetime('now'), datetime('now'))
  `).run(scheduleId);

  for (let i = 0; i < 25; i++) {
    db.prepare(`
      INSERT INTO job_history (id, schedule_id, status, trigger_type, started_at)
      VALUES (?, ?, ?, 'manual', datetime('now', '-' || ? || ' minutes'))
    `).run(uuidv4(), scheduleId, i < 15 ? 'completed' : 'failed', i);
  }
});

afterAll(() => {
  closeDatabase();
});

describe('Jobs API', () => {
  it('GET /api/jobs lists jobs with default pagination', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.total).toBe(25);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.data.length).toBe(20);
    expect(res.body.totalPages).toBe(2);
  });

  it('GET /api/jobs supports custom page and limit', async () => {
    const res = await request(app).get('/api/jobs?limit=5&page=2');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(5);
  });

  it('GET /api/jobs supports status filter', async () => {
    const res = await request(app).get('/api/jobs?status=completed');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(15);
    expect(res.body.data.every((j: { status: string }) => j.status === 'completed')).toBe(true);
  });

  it('GET /api/jobs supports schedule_id filter', async () => {
    const res = await request(app).get(`/api/jobs?schedule_id=${scheduleId}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
  });

  it('GET /api/jobs clamps negative page to 1', async () => {
    const res = await request(app).get('/api/jobs?page=-5');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it('GET /api/jobs clamps excessive limit to 100', async () => {
    const res = await request(app).get('/api/jobs?limit=999999');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('GET /api/jobs clamps zero limit to 1', async () => {
    const res = await request(app).get('/api/jobs?limit=0');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
  });

  it('GET /api/jobs handles NaN page gracefully', async () => {
    const res = await request(app).get('/api/jobs?page=abc');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it('GET /api/jobs/:id returns a job', async () => {
    const listRes = await request(app).get('/api/jobs?limit=1');
    const jobId = listRes.body.data[0].id;

    const res = await request(app).get(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(jobId);
    expect(res.body.request_payload).toBeDefined();
    expect(res.body.response_payload).toBeDefined();
  });

  it('GET /api/jobs/:id returns 404 for missing job', async () => {
    const res = await request(app).get('/api/jobs/nonexistent');
    expect(res.status).toBe(404);
  });
});
