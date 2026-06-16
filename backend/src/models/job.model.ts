import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database';

export interface JobHistoryRow {
  id: string;
  schedule_id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  heretto_job_id: string | null;
  request_payload: string;
  response_payload: string;
  error: string | null;
}

export interface FormattedJob {
  id: string;
  schedule_id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  heretto_job_id: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error: string | null;
}

function safeJsonParse(value: string | null | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatJob(row: JobHistoryRow): FormattedJob {
  return {
    ...row,
    request_payload: safeJsonParse(row.request_payload, {}),
    response_payload: safeJsonParse(row.response_payload, {}),
  };
}

const MAX_PAGE_LIMIT = 100;

export function getJobs(options: { page?: number; limit?: number; schedule_id?: string; status?: string } = {}) {
  const db = getDatabase();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];

  if (options.schedule_id) {
    where += ' AND schedule_id = ?';
    params.push(options.schedule_id);
  }
  if (options.status) {
    where += ' AND status = ?';
    params.push(options.status);
  }

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM job_history ${where}`).get(...params) as { count: number };
  const total = countRow.count;

  const rows = db.prepare(`SELECT * FROM job_history ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as JobHistoryRow[];

  return {
    data: rows.map(formatJob),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getJobById(id: string): FormattedJob | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM job_history WHERE id = ?').get(id) as JobHistoryRow | undefined;
  return row ? formatJob(row) : null;
}

export function createJob(input: {
  schedule_id: string;
  trigger_type: 'scheduled' | 'manual';
  request_payload?: Record<string, unknown>;
}): FormattedJob {
  const db = getDatabase();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO job_history (id, schedule_id, status, trigger_type, started_at, request_payload)
    VALUES (?, ?, 'running', ?, datetime('now'), ?)
  `).run(id, input.schedule_id, input.trigger_type, JSON.stringify(input.request_payload || {}));

  const created = getJobById(id);
  if (!created) {
    throw new Error('Failed to create job — row not found after insert');
  }
  return created;
}

export function updateJob(id: string, update: {
  status?: string;
  completed_at?: string;
  heretto_job_id?: string;
  response_payload?: Record<string, unknown>;
  error?: string;
}): FormattedJob | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (update.status !== undefined) { fields.push('status = ?'); values.push(update.status); }
  if (update.completed_at !== undefined) { fields.push('completed_at = ?'); values.push(update.completed_at); }
  if (update.heretto_job_id !== undefined) { fields.push('heretto_job_id = ?'); values.push(update.heretto_job_id); }
  if (update.response_payload !== undefined) { fields.push('response_payload = ?'); values.push(JSON.stringify(update.response_payload)); }
  if (update.error !== undefined) { fields.push('error = ?'); values.push(update.error); }

  if (fields.length === 0) return getJobById(id);

  values.push(id);
  db.prepare(`UPDATE job_history SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getJobById(id);
}

export function pruneOldJobs(retentionDays: number = 90): number {
  const db = getDatabase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const result = db.prepare('DELETE FROM job_history WHERE started_at < ?').run(cutoff.toISOString());
  return result.changes;
}
