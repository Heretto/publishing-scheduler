CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cron_expression TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  document_ids TEXT DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,
  last_run_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trigger_type TEXT NOT NULL DEFAULT 'scheduled',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  heretto_job_id TEXT,
  request_payload TEXT DEFAULT '{}',
  response_payload TEXT DEFAULT '{}',
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_history_schedule_id ON job_history(schedule_id);
CREATE INDEX IF NOT EXISTS idx_job_history_started_at ON job_history(started_at);
