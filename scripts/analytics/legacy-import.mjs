#!/usr/bin/env node
// Local, offline tool for the legacy panel-log import. It never contacts a
// remote database and never prints addresses, user agents or paths.
//
//   node scripts/analytics/legacy-import.mjs inventory <log file>
//       SHA-256, line count, dispositions, first/last instant, DST flags.
//   node scripts/analytics/legacy-import.mjs rehearse <log file> [<earlier log file>...]
//       Applies the earlier snapshots then this one to an in-memory database
//       with the real migration, prints the reconciliation and proves a second
//       run adds nothing.
//   node scripts/analytics/legacy-import.mjs sql <log file> --out private/<name>.sql
//       Writes the import as idempotent SQL for
//       `wrangler d1 execute <db> --remote --file <name>.sql` (the same
//       statements Boss runs; safe to run twice). The file contains visitor
//       data: keep it under private/ (git-ignored) and delete it afterwards.
//   node scripts/analytics/legacy-import.mjs daily <log file> [--compare <json>]
//       Per-LA-day page-view counts; with --compare, the difference against a
//       { "YYYY-MM-DD": n } file (for example a DNDR or old-panel export).
//
// Small deltas can run through the Access-protected Boss (Analytics → Legacy
// import); a full log is imported with the sql command, which needs no Worker
// CPU time. Both use the same statements.

import fs from 'node:fs';
import { applyPlan, dailyCounts, importStatements, planCorpus, renderSql } from '../../workers/shared/legacy-import.mjs';
import { isoUtc } from '../../workers/shared/time.mjs';

const [command, file, ...rest] = process.argv.slice(2);

function usage() {
  console.error('usage: legacy-import.mjs inventory|rehearse|sql|daily <log file> [...]');
  process.exit(2);
}

async function inventory(path) {
  const plan = await planCorpus(fs.readFileSync(path, 'utf8'));
  return {
    file: path.split(/[\\/]/).pop(),
    sha256: plan.sha256,
    lines: plan.lineCount,
    first: plan.firstAt != null ? isoUtc(plan.firstAt) : null,
    last: plan.lastAt != null ? isoUtc(plan.lastAt) : null,
    dispositions: plan.summary,
  };
}

async function rehearse(path, earlier) {
  const { D1Sqlite } = await import('../../tests/helpers/d1-sqlite.mjs');
  const db = D1Sqlite.analytics();
  const now = Math.floor(Date.now() / 1000);
  const reports = [];
  for (const p of [...earlier, path]) {
    const plan = await planCorpus(fs.readFileSync(p, 'utf8'));
    reports.push(await applyPlan(db, plan, { actor: 'rehearsal', now }));
  }
  const before = db.count('visitor_events');
  const plan = await planCorpus(fs.readFileSync(path, 'utf8'));
  const rerun = await applyPlan(db, plan, { actor: 'rehearsal', now });
  return {
    reports,
    rerun: { checks: rerun.checks, eventsAddedBySecondRun: db.count('visitor_events') - before },
    totals: {
      events: db.count('visitor_events'),
      human: db.count('visitor_events', "automation = 'human'"),
      automated: db.count('visitor_events', "automation = 'automated'"),
    },
  };
}

async function daily(path, compareFile) {
  const counts = dailyCounts(await planCorpus(fs.readFileSync(path, 'utf8')));
  if (!compareFile) return counts;
  const other = JSON.parse(fs.readFileSync(compareFile, 'utf8'));
  const days = [...new Set([...Object.keys(counts), ...Object.keys(other)])].sort();
  const diff = days
    .map((d) => ({ day: d, file: counts[d] || 0, other: Number(other[d] || 0) }))
    .filter((r) => r.file !== r.other);
  return { days: days.length, mismatches: diff.length, diff };
}

async function sql(path, outIndex) {
  const out = outIndex >= 0 ? rest[outIndex + 1] : null;
  if (!out || !/(^|[\\/])private[\\/]/.test(out)) throw new Error('--out must point into private/ (git-ignored)');
  const plan = await planCorpus(fs.readFileSync(path, 'utf8'));
  const text = renderSql(importStatements(plan, { actor: 'offline-import', now: Math.floor(Date.now() / 1000) }));
  fs.mkdirSync(out.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(out, text);
  return { sha256: plan.sha256, lines: plan.lineCount, dispositions: plan.summary, statements: text.split('\n').length - 1, written: out };
}

if (!command || !file) usage();
let out;
if (command === 'inventory') out = await inventory(file);
else if (command === 'rehearse') out = await rehearse(file, rest);
else if (command === 'sql') out = await sql(file, rest.indexOf('--out'));
else if (command === 'daily') out = await daily(file, rest[0] === '--compare' ? rest[1] : null);
else usage();
console.log(JSON.stringify(out, null, 2));
