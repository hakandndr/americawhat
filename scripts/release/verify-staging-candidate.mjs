// Read-only verification. The expected manifest seal comes from the owner's reviewed release record.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [manifestPath,expectedSeal]=process.argv.slice(2);
assert.ok(manifestPath && /^[a-f0-9]{64}$/.test(expectedSeal||''),'Pass manifest path and reviewed SHA256 seal');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=fs.readFileSync(manifestPath);assert.ok(sha(raw)===expectedSeal,'Manifest seal differs from reviewed release');
const manifest=JSON.parse(raw);
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),manifest.head,'Checkout the reviewed source SHA');
assert.equal(git('status','--porcelain'),'','Clean source required');
const root=fs.realpathSync(manifest.packageRoot);
for(const file of manifest.files){
  const resolved=fs.realpathSync(path.resolve(root,file.path));const relative=path.relative(root,resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),'Artifact path escapes package');
  const bytes=fs.readFileSync(resolved);assert.ok(bytes.length===file.bytes && sha(bytes)===file.sha256,`Artifact mismatch: ${file.path}`);
}
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.relative(root,path.join(dir,entry.name)).replaceAll('\\','/')]);
assert.deepEqual(walk(root).sort(),manifest.files.map(f=>f.path).sort(),'Unexpected/missing package file');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'config/boss.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
assert.equal(cfg.name,'americawhat-boss-staging');assert.equal(cfg.workers_dev,false);assert.equal(cfg.preview_urls,false);
assert.equal(cfg.vars.ENVIRONMENT,'staging');assert.equal(cfg.vars.BOSS_GITHUB_REPOSITORY,'hakandndr/americawhat-staging-content');assert.equal(cfg.vars.BOSS_GITHUB_BRANCH,'content-staging');
assert.equal(cfg.vars.BOSS_ALLOWED_EMAILS,'hakan@dndr.net');
assert.equal(cfg.vars.BOSS_ACCESS_TEAM_DOMAIN,'dndrnet.cloudflareaccess.com');
assert.equal(cfg.vars.BOSS_ACCESS_AUD,'f750490dc8657f942cf2eb7af70137e0f00bd19c9b437e7d82b0f0f2fd8b194b');
assert.equal(cfg.vars.BOSS_ORIGIN,'https://americawhat-boss-staging.hakan-c89.workers.dev');
assert.deepEqual(cfg.d1_databases.map(d=>d.database_id),['a3c9ff1f-05c2-4ed6-bb9e-4ca41f4cc9e2','306b9ee6-2529-4f95-b43c-c7cd9dbf0a3c']);
console.log(JSON.stringify({head:manifest.head,files:manifest.files.length,manifestSha256:expectedSeal,result:'PASS',remoteWrites:0}));
