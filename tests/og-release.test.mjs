import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ogInputDigest, planOgRelease, sha256 } from '../scripts/release/og.mjs';

const approved = JSON.parse(fs.readFileSync('scripts/release/approved-og.json', 'utf8'));
const { items } = JSON.parse(fs.readFileSync('src/data/published.json', 'utf8'));
const approvedFiles = () => new Map(approved.files.map((f) => [f.name, f.sha256]));
// Stories approved after the frozen archive get their image from the pinned
// renderer at release time (gen-og.py --missing), never from public/og.
const uncovered = items.filter((it) => !approved.files.some((f) => f.name === `${it.id}.png`));
const fakeEntry = (it, sha = 'a'.repeat(64)) => ({ file: `${it.id}.png`, inputSha256: ogInputDigest(it), sha256: sha, bytes: 1, status: 'rendered' });
const newItem = { id: 'aw-9999', title: 'Synthetic story for the OG pipeline test', category: 'bureaucracy', source_name: 'Example Source' };

test('the committed approved archive matches its manifest', () => {
  for (const file of approved.files) {
    const bytes = fs.readFileSync(path.join('public/og', file.name));
    assert.equal(bytes.length, file.bytes, file.name);
    assert.equal(sha256(bytes), file.sha256, file.name);
  }
  assert.deepEqual(fs.readdirSync('public/og').sort(), approved.files.map((f) => f.name).sort());
  // Items published after the approval are covered by generated images, not by this archive.
  const covered = items.filter((it) => approved.files.some((f) => f.name === `${it.id}.png`));
  const plan = planOgRelease({ items: covered, approved, approvedFiles: approvedFiles(), generated: null, generatedFiles: new Map() });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.summary.approved, covered.length);
});

test('a new published item needs a fresh image from the pinned renderer', () => {
  const all = [...items, newItem];
  const missing = planOgRelease({ items: all, approved, approvedFiles: approvedFiles(), generated: null, generatedFiles: new Map() });
  // Every published story outside the archive is reported until it is rendered.
  assert.deepEqual(missing.errors.map((e) => /No OG image for (aw-\d+)/.exec(e)?.[1]).sort(), [...uncovered.map((it) => it.id), 'aw-9999'].sort());

  const fresh = [...uncovered, newItem];
  const generated = { renderer: approved.renderer, items: Object.fromEntries(fresh.map((it) => [it.id, fakeEntry(it)])) };
  const generatedFiles = () => new Map(fresh.map((it) => [`${it.id}.png`, 'a'.repeat(64)]));
  const ok = planOgRelease({ items: all, approved, approvedFiles: approvedFiles(), generated, generatedFiles: generatedFiles() });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([...ok.copy].sort(), fresh.map((it) => `${it.id}.png`).sort());
  const oneShort = new Map(generatedFiles());
  if (uncovered.length) {
    oneShort.delete(`${uncovered[0].id}.png`);
    assert.notDeepEqual(planOgRelease({ items: all, approved, approvedFiles: approvedFiles(), generated, generatedFiles: oneShort }).errors, [], 'a missing rendered file is an error');
  }

  const edited = planOgRelease({ items: [...items, { ...newItem, title: 'Edited' }], approved, approvedFiles: approvedFiles(), generated, generatedFiles: generatedFiles() });
  assert.match(edited.errors.join(), /Stale OG image for aw-9999/);

  const tampered = planOgRelease({ items: all, approved, approvedFiles: approvedFiles(), generated, generatedFiles: new Map([...generatedFiles(), ['aw-9999.png', 'b'.repeat(64)]]) });
  assert.match(tampered.errors.join(), /does not match its manifest/);

  const unpinned = planOgRelease({ items: all, approved, approvedFiles: approvedFiles(), generated: { ...generated, renderer: { ...approved.renderer, pillow: '12.3.0' } }, generatedFiles: generatedFiles() });
  assert.match(unpinned.errors.join(), /unpinned renderer/);
});

test('approved images are frozen: altered, missing or extra files and edited text are reported', () => {
  const altered = approvedFiles();
  altered.set('aw-0011.png', '0'.repeat(64));
  assert.match(planOgRelease({ items: [], approved, approvedFiles: altered, generated: null, generatedFiles: new Map() }).errors.join(), /Unapproved OG artifact: aw-0011.png/);
  const extra = approvedFiles();
  extra.set('aw-9999.png', '0'.repeat(64));
  assert.match(planOgRelease({ items: [], approved, approvedFiles: extra, generated: null, generatedFiles: new Map() }).errors.join(), /exactly the approved archive/);
  const covered = items.filter((it) => approved.files.some((f) => f.name === `${it.id}.png`));
  const retitled = covered.map((it) => (it.id === covered[0].id ? { ...it, title: `${it.title}!` } : it));
  const plan = planOgRelease({ items: retitled, approved, approvedFiles: approvedFiles(), generated: null, generatedFiles: new Map() });
  assert.deepEqual(plan.errors, []);
  assert.match(plan.warnings.join(), new RegExp(`older text for: ${covered[0].id}`));
});

function pinnedPython() {
  for (const exe of [process.env.OG_PYTHON, 'python3', 'python'].filter(Boolean)) {
    const r = spawnSync(exe, ['-c', 'import PIL;from PIL import features;print(PIL.__version__, features.version("freetype2"))'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === '11.3.0 2.13.3') return exe;
  }
  return null;
}
const python = pinnedPython();

test('gen-og.py --missing renders only unapproved items, deterministically, and never touches public/og', { skip: python ? false : 'pinned Pillow 11.3.0 not installed (set OG_PYTHON)' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-og-'));
  try {
    for (const dir of ['scripts/og-fonts', 'scripts/release', 'public/og', 'src/data']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.copyFileSync('scripts/gen-og.py', path.join(root, 'scripts/gen-og.py'));
    for (const f of fs.readdirSync('scripts/og-fonts')) fs.copyFileSync(path.join('scripts/og-fonts', f), path.join(root, 'scripts/og-fonts', f));
    fs.copyFileSync('scripts/release/approved-og.json', path.join(root, 'scripts/release/approved-og.json'));
    for (const f of approved.files) fs.copyFileSync(path.join('public/og', f.name), path.join(root, 'public/og', f.name));
    const write = (list) => fs.writeFileSync(path.join(root, 'src/data/published.json'), JSON.stringify({ items: list }));
    const run = (...args) => {
      const r = spawnSync(python, ['-I', path.join(root, 'scripts/gen-og.py'), ...args], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout;
    };
    const generatedDir = path.join(root, '.og-generated');
    const read = () => JSON.parse(fs.readFileSync(path.join(generatedDir, 'manifest.json'), 'utf8'));
    const approvedBefore = fs.readdirSync(path.join(root, 'public/og')).map((f) => sha256(fs.readFileSync(path.join(root, 'public/og', f))));

    const freshIds = [...uncovered.map((it) => it.id), 'aw-9999'].sort();
    write([...items, newItem]);
    assert.match(run('--missing'), new RegExp(`"rendered": ${freshIds.length}\\b`));
    const first = read();
    assert.deepEqual(Object.keys(first.items).sort(), freshIds);
    assert.deepEqual(first.renderer, approved.renderer);
    assert.equal(first.items['aw-9999'].inputSha256, ogInputDigest(newItem));
    assert.equal(first.items['aw-9999'].status, 'rendered');

    assert.match(run('--missing'), new RegExp(`"kept": ${freshIds.length}\\b`));
    fs.rmSync(generatedDir, { recursive: true });
    run('--missing');
    assert.equal(read().items['aw-9999'].sha256, first.items['aw-9999'].sha256, 'same input, same bytes');

    write([...items, { ...newItem, title: 'A different synthetic title' }]);
    run('--missing');
    assert.notEqual(read().items['aw-9999'].sha256, first.items['aw-9999'].sha256, 'edited text is re-rendered');

    write(items);
    run('--missing');
    assert.deepEqual(Object.keys(read().items).sort(), uncovered.map((it) => it.id).sort());
    assert.ok(!fs.existsSync(path.join(generatedDir, 'aw-9999.png')), 'unpublished image removed');

    const afterwards = fs.readdirSync(path.join(root, 'public/og')).map((f) => sha256(fs.readFileSync(path.join(root, 'public/og', f))));
    assert.deepEqual(afterwards, approvedBefore, 'approved archive untouched');

    const refused = spawnSync(python, ['-I', path.join(root, 'scripts/gen-og.py'), '--all', '--out', path.join(root, 'public/og')], { encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
