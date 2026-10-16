// Compare the frozen public UI across Astro compiler versions without a browser.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
import { elementContract } from './html-contract.mjs';

const value = (flag) => process.argv[process.argv.indexOf(flag) + 1];
assert.ok(process.argv.includes('--baseline'), 'Pass --baseline <approved dist directory>');
const baseline = path.resolve(value('--baseline'));
const root = path.resolve('dist');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const oldPages = walk(baseline).filter((file) => file.endsWith('.html')).map((file) => path.relative(baseline, file)).sort();
const pages = walk(root).filter((file) => file.endsWith('.html')).map((file) => path.relative(root, file)).sort();
assert.deepEqual(pages, oldPages, 'Public URL/file set changed');
const body = (dir, rel) => {
  const { document } = parseHTML(fs.readFileSync(path.join(dir, rel), 'utf8'));
  // The build-time fallback intentionally chooses a different valid story per build.
  document.getElementById('nav-random')?.setAttribute('href', '/item/__random__/');
  return elementContract(document.body, { skipScripts: true });
};
for (const rel of pages) assert.deepEqual(body(root, rel), body(baseline, rel), `Public DOM changed: ${rel}`);

// Use Wrangler's declared, installed esbuild; never rely on an ancestor checkout.
const requireTool = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const { transformSync, version } = requireTool('esbuild');
const css = (dir) => {
  const files = walk(path.join(dir, '_astro')).filter((file) => file.endsWith('.css'));
  assert.equal(files.length, 1, 'Expected the single global public stylesheet');
  return transformSync(fs.readFileSync(files[0], 'utf8'), { loader: 'css', minify: true }).code;
};
assert.equal(css(root), css(baseline), 'CSS rules or values changed');
if (process.argv.includes('--ref')) execFileSync('git', ['diff', '--exit-code', value('--ref'), '--', 'src'], { stdio: 'pipe' });
console.log(JSON.stringify({ pages: pages.length, bodyContracts: 'identical', cssContract: 'identical', cssParser: `esbuild ${version}`, publicSource: process.argv.includes('--ref') ? 'unchanged' : 'not compared', ignored: 'HTML collapsed formatting whitespace, scripts tested separately, random fallback href', graphicalTest: false, result: 'PASS' }, null, 2));
