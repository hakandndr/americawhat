// A D1-compatible adapter over Node's built-in SQLite, for tests only. The real
// migrations and the real SQL run on a real SQLite engine (D1 is SQLite), so
// constraints, triggers and batch atomicity are exercised rather than mocked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const D1_MAX_BOUND_PARAMETERS = 100;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class Statement {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    // Cloudflare D1 refuses more than 100 bound parameters per statement.
    if (args.length > D1_MAX_BOUND_PARAMETERS) throw new Error(`D1_ERROR: too many SQL variables (${args.length} > ${D1_MAX_BOUND_PARAMETERS})`);
    return new Statement(this.db, this.sql, args.map((a) => (a === undefined ? null : a)));
  }

  async run() { return this.runSync(); }

  runSync() {
    const info = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.args) ?? null;
    if (row && column) return row[column];
    return row ? { ...row } : null;
  }

  async all() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) };
  }

  async raw() {
    const stmt = this.db.prepare(this.sql);
    return stmt.all(...this.args).map((r) => Object.values(r));
  }
}

export class D1Sqlite {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    this.failNextBatch = null;
  }

  static withMigrations(...relativeFiles) {
    const db = new D1Sqlite();
    for (const file of relativeFiles) db.sqlite.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    return db;
  }

  static app() { return D1Sqlite.withMigrations('migrations/app/0001_app_core.sql'); }
  static analytics() { return D1Sqlite.withMigrations('migrations/analytics/0001_analytics_core.sql'); }

  prepare(sql) {
    return new Statement(this.sqlite, sql);
  }

  /** As D1: all statements in one transaction; any error rolls everything back and rejects. */
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const s of statements) {
        if (this.failNextBatch && results.length === this.failNextBatch.at) {
          this.failNextBatch = null;
          throw new Error('injected batch failure');
        }
        const isRead = /^\s*(select|with)\b/i.test(s.sql) && !/\breturning\b/i.test(s.sql);
        if (isRead || /\breturning\b/i.test(s.sql)) {
          results.push({ success: true, results: s.db.prepare(s.sql).all(...s.args).map((r) => ({ ...r })), meta: { changes: 0 } });
        } else {
          results.push(s.runSync());
        }
      }
      this.sqlite.exec('COMMIT');
      return results;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 1 };
  }

  count(table, where = '1=1', ...args) {
    return Number(this.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...args).n);
  }
}
