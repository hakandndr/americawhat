import test from 'node:test';
import assert from 'node:assert/strict';
import { compareContent } from '../scripts/release/reconcile-main.mjs';

const item = (id, title = id) => ({ id, title, seen_id: `src-${id}` });
const state = (published, pending, seen) => ({ published: { items: published }, pending, seen });

test('a merge that keeps main content passes', () => {
  const base = state([item('aw-1')], [item('aw-p-1')], ['a']);
  const main = state([item('aw-1'), item('aw-2')], [item('aw-p-1'), item('aw-p-2')], ['a', 'b']);
  assert.deepEqual(compareContent({ base, main, merged: main }).errors, []);
});

test('losing a published item, a main-side edit, a pending candidate or seen ids blocks', () => {
  const base = state([item('aw-1')], [item('aw-p-1')], ['a']);
  const main = state([item('aw-1', 'edited on main'), item('aw-2')], [item('aw-p-1'), item('aw-p-2')], ['a', 'b']);
  const merged = state([item('aw-1')], [item('aw-p-1')], ['a']);
  const errors = compareContent({ base, main, merged }).errors.join('\n');
  assert.match(errors, /published item aw-2 \(on main\) is missing/);
  assert.match(errors, /aw-1 was edited on main/);
  assert.match(errors, /pending candidate aw-p-2/);
  assert.match(errors, /1 seen ids from main are missing/);
});

test('a candidate that left pending because it was published is not a loss', () => {
  const base = state([], [item('aw-p-1')], ['a']);
  const main = state([], [item('aw-p-1')], ['a']);
  const merged = state([{ id: 'aw-9', seen_id: 'src-aw-p-1' }], [], ['a']);
  assert.deepEqual(compareContent({ base, main, merged }).errors, []);
});
