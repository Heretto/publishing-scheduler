import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initDatabase, closeDatabase, getDatabase } from '../../src/db/database';
import * as ScheduleModel from '../../src/models/schedule.model';
import * as JobModel from '../../src/models/job.model';

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

describe('Schedule model', () => {
  const input: ScheduleModel.CreateScheduleInput = {
    name: 'Test',
    description: 'desc',
    cron_expression: '0 9 * * *',
    scenario_id: 's1',
    deployment_id: 'd1',
    document_ids: ['doc-1'],
    enabled: true,
  };

  it('creates and retrieves a schedule', () => {
    const created = ScheduleModel.createSchedule(input);
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Test');
    expect(created.document_ids).toEqual(['doc-1']);
    expect(created.enabled).toBe(true);

    const fetched = ScheduleModel.getScheduleById(created.id);
    expect(fetched).toEqual(created);
  });

  it('getAllSchedules returns all schedules', () => {
    ScheduleModel.createSchedule(input);
    ScheduleModel.createSchedule({ ...input, name: 'Second' });
    expect(ScheduleModel.getAllSchedules().length).toBe(2);
  });

  it('updateSchedule updates specific fields', () => {
    const created = ScheduleModel.createSchedule(input);
    const updated = ScheduleModel.updateSchedule(created.id, { name: 'New Name' });
    expect(updated!.name).toBe('New Name');
    expect(updated!.description).toBe('desc');
  });

  it('updateSchedule returns null for nonexistent', () => {
    expect(ScheduleModel.updateSchedule('bad-id', { name: 'x' })).toBeNull();
  });

  it('deleteSchedule returns true on success, false on miss', () => {
    const created = ScheduleModel.createSchedule(input);
    expect(ScheduleModel.deleteSchedule(created.id)).toBe(true);
    expect(ScheduleModel.deleteSchedule(created.id)).toBe(false);
  });

  it('toggleSchedule changes enabled state', () => {
    const created = ScheduleModel.createSchedule(input);
    const toggled = ScheduleModel.toggleSchedule(created.id, false);
    expect(toggled!.enabled).toBe(false);

    const back = ScheduleModel.toggleSchedule(created.id, true);
    expect(back!.enabled).toBe(true);
  });

  it('toggleSchedule returns null for nonexistent', () => {
    expect(ScheduleModel.toggleSchedule('bad-id', true)).toBeNull();
  });

  it('handles corrupted document_ids JSON gracefully', () => {
    const db = getDatabase();
    const id = 'corrupt-test';
    db.prepare(`
      INSERT INTO schedules (id, name, cron_expression, scenario_id, deployment_id, document_ids, created_at, updated_at)
      VALUES (?, 'Corrupt', '0 9 * * *', 's1', 'd1', 'not-json', datetime('now'), datetime('now'))
    `).run(id);

    const schedule = ScheduleModel.getScheduleById(id);
    expect(schedule).toBeTruthy();
    expect(schedule!.document_ids).toEqual([]);
  });
});

describe('Job model', () => {
  let scheduleId: string;

  beforeEach(() => {
    const schedule = ScheduleModel.createSchedule({
      name: 'For Jobs',
      description: '',
      cron_expression: '0 9 * * *',
      scenario_id: 's1',
      deployment_id: 'd1',
      document_ids: [],
      enabled: true,
    });
    scheduleId = schedule.id;
  });

  it('creates and retrieves a job', () => {
    const job = JobModel.createJob({
      schedule_id: scheduleId,
      trigger_type: 'manual',
      request_payload: { foo: 'bar' },
    });
    expect(job.status).toBe('running');
    expect(job.request_payload).toEqual({ foo: 'bar' });

    const fetched = JobModel.getJobById(job.id);
    expect(fetched).toEqual(job);
  });

  it('updateJob updates fields', () => {
    const job = JobModel.createJob({ schedule_id: scheduleId, trigger_type: 'manual' });
    const updated = JobModel.updateJob(job.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      heretto_job_id: 'h-123',
    });
    expect(updated!.status).toBe('completed');
    expect(updated!.heretto_job_id).toBe('h-123');
  });

  it('getJobs paginates correctly', () => {
    for (let i = 0; i < 15; i++) {
      JobModel.createJob({ schedule_id: scheduleId, trigger_type: 'manual' });
    }

    const page1 = JobModel.getJobs({ page: 1, limit: 10 });
    expect(page1.data.length).toBe(10);
    expect(page1.total).toBe(15);
    expect(page1.totalPages).toBe(2);

    const page2 = JobModel.getJobs({ page: 2, limit: 10 });
    expect(page2.data.length).toBe(5);
  });

  it('getJobs clamps invalid pagination values', () => {
    const result = JobModel.getJobs({ page: -1, limit: 500 });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
  });

  it('handles corrupted JSON payloads gracefully', () => {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO job_history (id, schedule_id, status, trigger_type, started_at, request_payload, response_payload)
      VALUES ('corrupt-job', ?, 'completed', 'manual', datetime('now'), 'bad-json', '{also bad}')
    `).run(scheduleId);

    const job = JobModel.getJobById('corrupt-job');
    expect(job).toBeTruthy();
    expect(job!.request_payload).toEqual({});
    expect(job!.response_payload).toEqual({});
  });

  it('pruneOldJobs removes old entries', () => {
    const db = getDatabase();
    // Insert a job 100 days old
    db.prepare(`
      INSERT INTO job_history (id, schedule_id, status, trigger_type, started_at)
      VALUES ('old-job', ?, 'completed', 'manual', datetime('now', '-100 days'))
    `).run(scheduleId);
    // Insert a recent job
    JobModel.createJob({ schedule_id: scheduleId, trigger_type: 'manual' });

    const deleted = JobModel.pruneOldJobs(90);
    expect(deleted).toBe(1);

    const remaining = JobModel.getJobs();
    expect(remaining.total).toBe(1);
  });
});
