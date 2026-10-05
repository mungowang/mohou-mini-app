-- One row per model / agent / MCP run. `steps` and `meta` are JSON text so a run's shape can grow
-- without a migration per field; `kind`, `status` and `started_at` are real columns because they
-- are what the history rail filters and orders by.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  source TEXT,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  input TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  error TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  meta TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER
);

CREATE INDEX idx_runs_started ON runs (started_at DESC);
CREATE INDEX idx_runs_kind ON runs (kind, started_at DESC);
