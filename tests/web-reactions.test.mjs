import test from 'node:test';
import assert from 'node:assert/strict';
import { D1Sqlite } from './helpers/d1-sqlite.mjs';
import { parseIds, readCounts, recordReaction, RATE_LIMIT_PER_HOUR } from '../workers/web/src/reactions.mjs';

const SECRET = 'test-secret';
const PUBLISHED = new Set(['aw-0001', 'aw-0002']);
const NOW = 1791976000;

function vote(db, over = {}) {
  return recordReaction(db, { itemId: 'aw-0001', reaction: 'lol', ip: '203.0.113.5', secret: SECRET, publishedIds: PUBLISHED, now: NOW, ...over });
}

test('a first reaction counts once and returns the new counts', async () => {
  const db = D1Sqlite.app();
  const r = await vote(db);
  assert.equal(r.status, 'ok');
  assert.equal(r.counted, true);
  assert.deepEqual(r.counts, { wat: 0, lol: 1, same: 0, dead: 0 });
});

test('the same address, item and reaction on the same LA day counts once', async () => {
  const db = D1Sqlite.app();
  await vote(db);
  const again = await vote(db, { now: NOW + 60 });
  assert.equal(again.counted, false);
  assert.equal(again.counts.lol, 1);
});

test('different addresses each count', async () => {
  const db = D1Sqlite.app();
  for (let i = 1; i <= 5; i++) await vote(db, { ip: `198.51.100.${i}` });
  assert.equal((await readCounts(db, ['aw-0001']))['aw-0001'].lol, 5);
});

test('validation: unknown item, malformed id, bad reaction, missing secret', async () => {
  const db = D1Sqlite.app();
  assert.equal((await vote(db, { itemId: 'aw-9999' })).error, 'unknown_item');
  assert.equal((await vote(db, { itemId: '../etc' })).error, 'bad_id');
  assert.equal((await vote(db, { reaction: 'love' })).error, 'bad_reaction');
  assert.equal((await vote(db, { secret: '' })).error, 'not_configured');
  assert.equal(db.count('reaction_counts'), 0);
});

test('hourly rate limit per address stops counting after the limit', async () => {
  const db = D1Sqlite.app();
  // Exhaust the hourly bucket (duplicates also consume it), then a new pair is refused.
  for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) await vote(db);
  const late = await vote(db, { reaction: 'dead' });
  assert.equal(late.counted, false, 'over the hourly limit nothing counts');
  // The next hour opens a new bucket.
  const nextHour = await vote(db, { reaction: 'dead', now: NOW + 3600 });
  assert.equal(nextHour.counted, true);
});

test('concurrent increments from many addresses lose nothing', async () => {
  const db = D1Sqlite.app();
  await Promise.all(Array.from({ length: 50 }, (_, i) => vote(db, { ip: `192.0.2.${i}` })));
  assert.equal((await readCounts(db, ['aw-0001']))['aw-0001'].lol, 50);
});

test('a failed batch counts nothing', async () => {
  const db = D1Sqlite.app();
  db.failNextBatch = { at: 4 };
  await assert.rejects(() => vote(db));
  assert.equal(db.count('reaction_counts'), 0);
  assert.equal(db.count('reaction_guard'), 0);
  const ok = await vote(db);
  assert.equal(ok.counted, true);
});

test('no raw address is stored anywhere in APP_DB', async () => {
  const db = D1Sqlite.app();
  await vote(db, { ip: '203.0.113.77' });
  const dump = JSON.stringify([
    db.sqlite.prepare('SELECT * FROM reaction_guard').all(),
    db.sqlite.prepare('SELECT * FROM reaction_rate').all(),
  ]);
  assert.ok(!dump.includes('203.0.113.77'));
});

test('parseIds keeps well-formed unique ids only', () => {
  assert.deepEqual(parseIds('aw-0001, aw-0001,bad id,aw-0002,<script>'), ['aw-0001', 'aw-0002']);
  assert.deepEqual(parseIds(''), []);
});
