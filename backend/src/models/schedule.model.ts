import { z } from 'zod';
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database';

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).default(''),
  cron_expression: z.string().min(1).refine(
    (expr) => cron.validate(expr),
    { message: 'Invalid cron expression' },
  ),
  scenario_id: z.coerce.string().min(1),
  deployment_id: z.coerce.string().default(''),
  document_ids: z.array(z.string().min(1).max(255)).max(1000).default([]),
  enabled: z.boolean().default(true),
  branch: z.string().default('master'),
  publish_parameters: z.array(z.record(z.unknown())).default([]),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export interface ScheduleRow {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  scenario_id: string;
  deployment_id: string;
  document_ids: string;
  enabled: number;
  branch: string;
  publish_parameters: string;
  last_run_at: string | null;
  last_run_status: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface FormattedSchedule {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  scenario_id: string;
  deployment_id: string;
  document_ids: string[];
  enabled: boolean;
  branch: string;
  publish_parameters: Record<string, unknown>[];
  last_run_at: string | null;
  last_run_status: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function formatSchedule(row: ScheduleRow): FormattedSchedule {
  return {
    ...row,
    document_ids: safeJsonParse<string[]>(row.document_ids, []),
    publish_parameters: safeJsonParse<Record<string, unknown>[]>(row.publish_parameters, []),
    enabled: Boolean(row.enabled),
  };
}

export function getAllSchedules(): FormattedSchedule[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as ScheduleRow[];
  return rows.map(formatSchedule);
}

export function getScheduleById(id: string): FormattedSchedule | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as ScheduleRow | undefined;
  return row ? formatSchedule(row) : null;
}

export function createSchedule(input: CreateScheduleInput): FormattedSchedule {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO schedules (id, name, description, cron_expression, scenario_id, deployment_id, document_ids, enabled, branch, publish_parameters, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description,
    input.cron_expression,
    input.scenario_id,
    input.deployment_id,
    JSON.stringify(input.document_ids),
    input.enabled ? 1 : 0,
    input.branch,
    JSON.stringify(input.publish_parameters),
    now,
    now,
  );

  const created = getScheduleById(id);
  if (!created) {
    throw new Error('Failed to create schedule — row not found after insert');
  }
  return created;
}

export function updateSchedule(id: string, input: UpdateScheduleInput): FormattedSchedule | null {
  const db = getDatabase();
  const existing = getScheduleById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
  if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
  if (input.cron_expression !== undefined) { fields.push('cron_expression = ?'); values.push(input.cron_expression); }
  if (input.scenario_id !== undefined) { fields.push('scenario_id = ?'); values.push(input.scenario_id); }
  if (input.deployment_id !== undefined) { fields.push('deployment_id = ?'); values.push(input.deployment_id); }
  if (input.document_ids !== undefined) { fields.push('document_ids = ?'); values.push(JSON.stringify(input.document_ids)); }
  if (input.enabled !== undefined) { fields.push('enabled = ?'); values.push(input.enabled ? 1 : 0); }
  if (input.branch !== undefined) { fields.push('branch = ?'); values.push(input.branch); }
  if (input.publish_parameters !== undefined) { fields.push('publish_parameters = ?'); values.push(JSON.stringify(input.publish_parameters)); }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = getScheduleById(id);
  if (!updated) {
    throw new Error(`Failed to read schedule ${id} after update`);
  }
  return updated;
}

export function deleteSchedule(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  return result.changes > 0;
}

export function toggleSchedule(id: string, enabled: boolean): FormattedSchedule | null {
  const db = getDatabase();
  const existing = getScheduleById(id);
  if (!existing) return null;

  db.prepare('UPDATE schedules SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, new Date().toISOString(), id);
  return getScheduleById(id);
}

export function updateScheduleLastRun(id: string, status: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  // If success, reset consecutive failures. If failed, increment.
  const consecutiveFailures = status === 'success' ? 0 : 'consecutive_failures + 1';

  db.prepare(
    `UPDATE schedules
     SET last_run_at = ?,
         last_run_status = ?,
         consecutive_failures = ${consecutiveFailures},
         updated_at = ?
     WHERE id = ?`
  ).run(now, status, now, id);
}

export function disableSchedule(id: string, reason: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.prepare('UPDATE schedules SET enabled = 0, updated_at = ? WHERE id = ?')
    .run(now, id);
}
