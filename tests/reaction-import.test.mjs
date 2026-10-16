import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { applyReactionImport, exportVotesJson, parseVotesSnapshot, planReactionImport } from '../workers/shared/reaction-import.mjs';
import { readCounts, recordReaction } from '../workers/web/src/reactions.mjs';

const S1 = JSON.stringify({ 'aw-0100': { wat: 2, lol: 3, same: 0, dead: 1 }, 'aw-0050': { wat: 0, lol: 1, same: 0, dead: 0 }, 'aw-0007': { wat: 1, lol: 0, same: 0, dead: 0 } }, null, 4);
const S2 = JSON.stringify({ 'aw-0100': { wat: 2, lol: 5, same: 0, dead: 1 }, 'aw-0050': { wat: 0, lol: 1, same: 1, dead: 0 }, 'aw-0007': { wat: 1, lol: 0, same: 0, dead: 0 } }, null, 4);

async function importText(db, text, now = 1791976000) {
  const plan = await planReactionImport(db, text);
  if (!plan.ok) return plan;
  return { ...plan, applied: await applyReactionImport(db, plan, { actor: 'hakan@dndr.net', now }) };
}

test('baseline preserves every count exactly, including unpublished ids', async () => {
  const db = D1Sqlite.app();
  const r = await importText(db, S1);
  assert.equal(r.kind, 'baseline');
  assert.equal(r.votesAdded, 8);
  assert.deepEqual(await exportVotesJson(db), JSON.parse(S1));
});

test('the same snapshot cannot be imported twice', async () => {
  const db = D1Sqlite.app();
  await importText(db, S1);
  const again = await importText(db, S1);
  assert.equal(again.ok, false);
  assert.deepEqual(again.errors, ['already_imported']);
  assert.equal((await readCounts(db, ['aw-0100']))['aw-0100'].lol, 3);
});

test('delta adds only the difference and keeps votes cast on Cloudflare meanwhile', async () => {
  const db = D1Sqlite.app();
  await importText(db, S1);
  // Two votes arrive on Cloudflare after the baseline.
  for (const ip of ['192.0.2.1', '192.0.2.2']) {
    await recordReaction(db, { itemId: 'aw-0100', reaction: 'lol', ip, secret: 's', publishedIds: new Set(['aw-0100']), now: 1791976100 });
  }
  const d = await importText(db, S2, 1791990000);
  assert.equal(d.kind, 'delta');
  assert.equal(d.votesAdded, 3); // +2 lol on aw-0100, +1 same on aw-0050 at Hostinger
  const counts = await readCounts(db, ['aw-0100', 'aw-0050']);
  assert.equal(counts['aw-0100'].lol, 3 + 2 + 2);
  assert.equal(counts['aw-0050'].same, 1);
});

test('a snapshot with decreased counts is refused (possible reset at the source)', async () => {
  const db = D1Sqlite.app();
  await importText(db, S2);
  const r = await importText(db, S1);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('decrease:aw-0100.lol')));
});

test('invalid files are refused without writing', async () => {
  const db = D1Sqlite.app();
  assert.equal((await importText(db, 'nope')).ok, false);
  assert.equal(parseVotesSnapshot('{"bad id":{"wat":1}}').ok, false);
  assert.equal(parseVotesSnapshot('{"aw-1":{"wat":-1}}').ok, false);
  assert.equal(parseVotesSnapshot('{"aw-1":{"love":1}}').ok, false);
  assert.equal(db.count('reaction_counts'), 0);
  assert.equal(db.count('reaction_imports'), 0);
});

test('a failed batch applies nothing and can be retried', async () => {
  const db = D1Sqlite.app();
  const plan = await planReactionImport(db, S1);
  db.failNextBatch = { at: 2 };
  await assert.rejects(() => applyReactionImport(db, plan, { actor: 'x', now: 1 }));
  assert.equal(db.count('reaction_counts'), 0);
  assert.equal(db.count('reaction_imports'), 0);
  await applyReactionImport(db, plan, { actor: 'x', now: 1 });
  assert.equal(db.count('reaction_imports'), 1);
});

test('only one baseline can exist', async () => {
  const db = D1Sqlite.app();
  await importText(db, S1);
  await assert.rejects(() => db.prepare(
    "INSERT INTO reaction_imports (import_id, kind, source_sha256, keys_count, votes_added, snapshot_json, imported_at, actor) VALUES ('x','baseline',?,0,0,'{}',1,'a')",
  ).bind('f'.repeat(64)).run());
});
