-- AmericaWhat APP_DB (americawhat-app-staging / americawhat-app-production)
-- Reactions, reaction imports, abuse guards, editorial decisions and the Boss
-- operator audit. Published editorial content is NOT stored here: Git remains
-- the publication source of truth.

CREATE TABLE IF NOT EXISTS schema_info (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note       TEXT NOT NULL
);

-- One row per (published item, reaction). Increments are single UPSERT
-- statements, atomic in D1's single-writer SQLite.
CREATE TABLE IF NOT EXISTS reaction_counts (
  item_id    TEXT NOT NULL CHECK (item_id GLOB 'aw-*' AND length(item_id) <= 43),
  reaction   TEXT NOT NULL CHECK (reaction IN ('wat', 'lol', 'same', 'dead')),
  count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, reaction)
) WITHOUT ROWID;

-- Imported Hostinger snapshots (aw_votes.json). A snapshot is applied at most
-- once (unique SHA-256); only one baseline may exist; every delta records the
-- snapshot it was computed against, so deltas chain S1 -> S2 -> S3.
CREATE TABLE IF NOT EXISTS reaction_imports (
  import_id       TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('baseline', 'delta')),
  source_sha256   TEXT NOT NULL UNIQUE CHECK (length(source_sha256) = 64),
  previous_sha256 TEXT,
  keys_count      INTEGER NOT NULL CHECK (keys_count >= 0),
  votes_added     INTEGER NOT NULL CHECK (votes_added >= 0),
  snapshot_json   TEXT NOT NULL,
  imported_at     INTEGER NOT NULL,
  actor           TEXT NOT NULL,
  note            TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_imports_one_baseline
  ON reaction_imports (kind) WHERE kind = 'baseline';

-- Abuse guards. Keys are HMACs of (address, item, reaction, LA day) and of
-- (address, hour); raw addresses are never stored here.
CREATE TABLE IF NOT EXISTS reaction_guard (
  guard_key  TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS reaction_rate (
  bucket_key TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL CHECK (hits >= 0),
  window_end INTEGER NOT NULL
) WITHOUT ROWID;

-- Editorial decisions taken in Boss (approve / reject with a reason code).
CREATE TABLE IF NOT EXISTS editorial_decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  decided_at    INTEGER NOT NULL,
  actor         TEXT NOT NULL,
  decision      TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason_code   TEXT,
  note          TEXT NOT NULL DEFAULT '',
  pending_id    TEXT NOT NULL,
  seen_id       TEXT,
  published_id  TEXT,
  title         TEXT NOT NULL DEFAULT '',
  source_domain TEXT NOT NULL DEFAULT '',
  commit_sha    TEXT
);
CREATE INDEX IF NOT EXISTS idx_editorial_decisions_seen ON editorial_decisions (seen_id);

-- Append-only operator audit for Boss actions. No visitor data.
CREATE TABLE IF NOT EXISTS boss_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT '',
  outcome    TEXT NOT NULL,
  commit_sha TEXT,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER IF NOT EXISTS trg_boss_audit_no_update BEFORE UPDATE ON boss_audit
BEGIN SELECT RAISE(ABORT, 'boss_audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_boss_audit_no_delete BEFORE DELETE ON boss_audit
BEGIN SELECT RAISE(ABORT, 'boss_audit is append-only'); END;

INSERT OR IGNORE INTO schema_info (version, applied_at, note)
VALUES (1, CAST(strftime('%s', 'now') AS INTEGER), 'app core');
