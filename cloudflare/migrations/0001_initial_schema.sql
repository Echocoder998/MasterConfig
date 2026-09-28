CREATE TABLE IF NOT EXISTS catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  write_id TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO catalog_state (id, revision, write_id) VALUES (1, 0, '');

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_rules (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_field TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_rules_model_id ON model_rules (model_id);

CREATE TABLE IF NOT EXISTS configurations (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_configurations_model_id ON configurations (model_id);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
