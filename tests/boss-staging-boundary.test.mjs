import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {authenticate, resetKeyCache} from '../workers/boss/src/auth.mjs';
import {createGitHub, githubConfig} from '../workers/boss/src/github.mjs';
import {makeSigner} from './helpers/access-jwt.mjs';
const config=JSON.parse(fs.readFileSync(new URL('../workers/boss/wrangler.jsonc',import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,''));
const env={...config.vars,GITHUB_TOKEN:'synthetic-test-only'};

test('staging refuses production or any other repository/ref before making any GitHub request',async()=>{
  assert.equal(githubConfig(env).ok,true);
  for(const patch of [
    {BOSS_GITHUB_REPOSITORY:'hakandndr/americawhat'},
    {BOSS_GITHUB_REPOSITORY:'another/americawhat-staging-content'},
    {BOSS_GITHUB_BRANCH:'main'}, {BOSS_GITHUB_BRANCH:'master'},
    {BOSS_GITHUB_BRANCH:'content-staging-copy'}, {BOSS_GITHUB_BRANCH:'refs/heads/content-staging'},
    {BOSS_GITHUB_BRANCH:'content-staging/../main'},
  ]){
    let calls=0;const client=createGitHub({...env,...patch},{fetchImpl:async()=>{calls++;throw Error('No request permitted');}});
    assert.equal(client.config.ok,false);
    await assert.rejects(client.transact({message:'test',compute:()=>{throw Error('Must not compute');}}),error=>error.status===503);
    assert.equal(calls,0);
  }
  assert.equal(githubConfig({...config.env.production.vars,GITHUB_TOKEN:'synthetic'}).ok,true,'production configuration rules preserved');
});

test('real staging config accepts only signed team/audience/owner assertions and ignores local seams',async()=>{
  assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);
  const signer=makeSigner('staging-boundary');const wrongKey=makeSigner('staging-boundary');
  const claims={iss:`https://${env.BOSS_ACCESS_TEAM_DOMAIN}`,aud:[env.BOSS_ACCESS_AUD],email:'hakan@dndr.net'};
  const request=token=>new Request(env.BOSS_ORIGIN,{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});
  const run=async(token,over={})=>{resetKeyCache();return authenticate(request(token),{...env,...over},{fetchImpl:async url=>{assert.equal(String(url),`https://${env.BOSS_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);return Response.json({keys:[signer.jwk]});}});};
  assert.equal((await run(signer.sign(claims))).ok,true);
  assert.equal((await run(wrongKey.sign(claims))).status,401);
  assert.equal((await run(signer.sign({...claims,iss:'https://other.cloudflareaccess.com'}))).status,401);
  assert.equal((await run(signer.sign({...claims,aud:['wrong-audience-0000000000']}))).status,401);
  assert.equal((await run(signer.sign({...claims,email:'other@example.com'}))).status,403);
  assert.equal((await run(signer.sign({...claims,exp:1}))).status,401);
  assert.equal((await run(signer.sign(claims),{BOSS_ACCESS_AUD:''})).status,503);
  assert.equal((await run('')).status,401);
  assert.equal((await run(wrongKey.sign(claims),{BOSS_DEV_JWKS:JSON.stringify({keys:[wrongKey.jwk]})})).status,401);
});

test('JSON null, arrays and primitive JWT sections return401 without throwing or fetching keys',async()=>{
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');let requests=0;
  for(const [header,payload] of [[null,{}],[[],{}],[1,{}],[{alg:'RS256'},null],[{alg:'RS256'},[]],[{alg:'RS256'},'text']]){
    const token=`${encode(header)}.${encode(payload)}.AA`;
    const result=await authenticate(new Request(env.BOSS_ORIGIN,{headers:{'Cf-Access-Jwt-Assertion':token}}),env,{fetchImpl:async()=>{requests++;throw Error('No key fetch');}});
    assert.equal(result.ok,false);assert.equal(result.status,401);
  }
  assert.equal(requests,0);
});
