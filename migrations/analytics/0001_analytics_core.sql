-- AmericaWhat ANALYTICS_DB (americawhat-analytics-staging / -production)
-- One table for legacy (imported Hostinger panel log) and native (Cloudflare
-- collector) page views, an import ledger, retention rollups, the DNDR
-- forwarding outbox and the append-only operator log.

CREATE TABLE IF NOT EXISTS analytics_schema (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note       TEXT NOT NULL
);

-- id is the durable ALL #: AUTOINCREMENT never reuses a number, deletions
-- leave gaps, filters never renumber. event_uid is the stable identity used
-- for idempotency and for reconciliation with DNDR:
--   legacy: panel_log:<first 32 hex of sha256(trimmed line)>.<occurrence>
--   native: aw:<uuid>
CREATE TABLE IF NOT EXISTS visitor_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_uid        TEXT NOT NULL UNIQUE,
  origin           TEXT NOT NULL CHECK (origin IN ('legacy', 'native')),
  event            TEXT NOT NULL DEFAULT 'page_view' CHECK (event IN ('page_view')),
  occurred_at      INTEGER NOT NULL,
  la_day           TEXT NOT NULL,
  time_quality     TEXT NOT NULL DEFAULT 'exact'
                   CHECK (time_quality IN ('exact', 'dst_ambiguous_ordered', 'dst_ambiguous_first')),
  received_at      INTEGER NOT NULL,
  ip               TEXT NOT NULL DEFAULT '',
  country          TEXT NOT NULL DEFAULT '',
  country_code     TEXT NOT NULL DEFAULT '',
  region           TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  path             TEXT NOT NULL,
  page             TEXT NOT NULL,
  referrer         TEXT NOT NULL DEFAULT 'Direct',
  referrer_raw     TEXT NOT NULL DEFAULT '',
  user_agent       TEXT NOT NULL DEFAULT '',
  source_label     TEXT NOT NULL DEFAULT '',
  device           TEXT NOT NULL DEFAULT '',
  device_class     TEXT NOT NULL DEFAULT 'unknown' CHECK (device_class IN ('mobile', 'desktop', 'unknown')),
  browser          TEXT NOT NULL DEFAULT '',
  os               TEXT NOT NULL DEFAULT '',
  agent            TEXT NOT NULL DEFAULT '',
  automation       TEXT NOT NULL CHECK (automation IN ('human', 'automated')),
  import_corpus_id TEXT,
  import_record_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_ve_occurred   ON visitor_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_ve_day        ON visitor_events (la_day, id);
CREATE INDEX IF NOT EXISTS idx_ve_ip_event   ON visitor_events (ip, event);
CREATE INDEX IF NOT EXISTS idx_ve_ip_time    ON visitor_events (ip, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ve_page       ON visitor_events (page, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ve_origin     ON visitor_events (origin, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ve_country    ON visitor_events (country, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ve_automation ON visitor_events (automation, occurred_at);

-- Import ledger. Every line of an imported corpus gets exactly one ledger row
-- with one disposition; a corpus (identified by its SHA-256) is recorded once.
-- A later snapshot of the same append-only log repeats earlier lines: they get
-- the same record_id and the disposition already_present.
CREATE TABLE IF NOT EXISTS analytics_import_corpora (
  corpus_id       TEXT PRIMARY KEY CHECK (substr(corpus_id, 1, 5) = 'corp_'),
  content_sha256  TEXT NOT NULL UNIQUE CHECK (length(content_sha256) = 64),
  source_system   TEXT NOT NULL,
  parser_version  TEXT NOT NULL,
  time_zone       TEXT NOT NULL,
  line_count      INTEGER NOT NULL CHECK (line_count >= 0),
  first_record_at INTEGER,
  last_record_at  INTEGER,
  imported_at     INTEGER NOT NULL,
  actor           TEXT NOT NULL,
  summary_json    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_import_records (
  corpus_id   TEXT NOT NULL REFERENCES analytics_import_corpora (corpus_id),
  line_no     INTEGER NOT NULL,
  record_id   TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN
                ('imported', 'already_present', 'missing_page', 'malformed', 'invalid_time', 'before_retention_cutoff')),
  event_uid   TEXT,
  detail      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (corpus_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_air_disposition ON analytics_import_records (corpus_id, disposition);
CREATE INDEX IF NOT EXISTS idx_air_record ON analytics_import_records (record_id);

-- Known coverage segments (legacy corpus ranges, native start, known gaps).
CREATE TABLE IF NOT EXISTS analytics_coverage (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('legacy_corpus', 'native_start', 'known_gap', 'note')),
  started_at INTEGER,
  ended_at   INTEGER,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Non-identifying aggregates written in the same batch as a Delete Before Date,
-- so all-time statistics survive removal of raw records. No address, user
-- agent, city or path below month level is kept.
CREATE TABLE IF NOT EXISTS analytics_rollup_daily (
  la_day     TEXT NOT NULL,
  origin     TEXT NOT NULL,
  automation TEXT NOT NULL,
  page_views INTEGER NOT NULL CHECK (page_views >= 0),
  PRIMARY KEY (la_day, origin, automation)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS analytics_rollup_monthly_page (
  la_month   TEXT NOT NULL,
  page       TEXT NOT NULL,
  page_views INTEGER NOT NULL CHECK (page_views >= 0),
  PRIMARY KEY (la_month, page)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS analytics_rollup_monthly_country (
  la_month   TEXT NOT NULL,
  country    TEXT NOT NULL,
  page_views INTEGER NOT NULL CHECK (page_views >= 0),
  PRIMARY KEY (la_month, country)
) WITHOUT ROWID;

-- Best-effort DNDR copies of native rows. Written in the same batch as the
-- source row only when forwarding is configured; a failed forward never
-- affects the source row.
CREATE TABLE IF NOT EXISTS dndr_outbox (
  event_uid  TEXT PRIMARY KEY,
  state      TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Append-only operator log (deletions, imports). Never addresses or paths.
CREATE TABLE IF NOT EXISTS analytics_operator_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id         TEXT NOT NULL UNIQUE,
  at            INTEGER NOT NULL,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('delete_before', 'legacy_import')),
  cutoff_day    TEXT,
  cutoff_at     INTEGER,
  record_count  INTEGER NOT NULL,
  oldest_at     INTEGER,
  newest_at     INTEGER,
  detail        TEXT NOT NULL DEFAULT ''
);

CREATE TRIGGER IF NOT EXISTS trg_operator_log_no_update BEFORE UPDATE ON analytics_operator_log
BEGIN SELECT RAISE(ABORT, 'analytics_operator_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_operator_log_no_delete BEFORE DELETE ON analytics_operator_log
BEGIN SELECT RAISE(ABORT, 'analytics_operator_log is append-only'); END;

INSERT OR IGNORE INTO analytics_schema (version, applied_at, note)
VALUES (1, CAST(strftime('%s', 'now') AS INTEGER), 'analytics core');
