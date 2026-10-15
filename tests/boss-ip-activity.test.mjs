import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {D1Sqlite} from './helpers/d1-sqlite.mjs';
import {AUD,TEAM,makeSigner} from './helpers/access-jwt.mjs';
import {createBoss} from '../workers/boss/src/index.mjs';
import {resetKeyCache} from '../workers/boss/src/auth.mjs';
import {ipActivity,parseFilters,pagination,numberedStream,summary,retentionStatus} from '../workers/boss/src/analytics-db.mjs';
import {validIpAddress,ipActivityParams,analyticsBack} from '../workers/boss/src/analytics-links.mjs';
import {renderAnalytics} from '../workers/boss/src/pages/analytics.mjs';
import {exportResponse} from '../workers/boss/src/export.mjs';

const NOW=1792058400, IP='2001:db8:abcd:1234:5678:90ab:cdef:1234';
const signer=makeSigner();
function seed(count=130){
  const db=D1Sqlite.analytics();
  const insert=db.sqlite.prepare(`INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,ip,country,path,page,referrer_raw,user_agent,automation,device_class,browser) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(let i=1;i<=count;i++)insert.run(`aw:ip-${i}`,'native',NOW-i*86400,`2026-${String(Math.ceil(i/28)).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`,NOW,IP,'Germany','/item/<script>/','/item/test','https://example.com/?q=<svg/onload=alert(1)>','<script>alert(1)</script>','human','desktop','Firefox');
  insert.run('aw:other','legacy',NOW,'2026-10-15',NOW,'203.0.113.8','Canada','/','/','','','automated','mobile','Chrome');
  return db;
}
function router(db){
  resetKeyCache();
  const env={ENVIRONMENT:'staging',ANALYTICS_DB:db,BOSS_ACCESS_TEAM_DOMAIN:TEAM,BOSS_ACCESS_AUD:AUD,BOSS_ALLOWED_EMAILS:'hakan@dndr.net'};
  const boss=createBoss({clock:()=>NOW*1000,fetchImpl:async()=>new Response(JSON.stringify({keys:[signer.jwk]}))});
  return async(path,token=signer.sign({email:'hakan@dndr.net',iat:NOW-10,nbf:NOW-10,exp:NOW+3600}))=>boss.fetch(new Request('https://boss.example'+path,{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}}),env,{});
}

test('IP validation accepts IPv4/IPv6 and rejects malformed, ambiguous and injected values',()=>{
  for(const ip of ['127.0.0.1','0.0.0.0','255.255.255.255','::1',IP,'::ffff:192.0.2.1'])assert.equal(validIpAddress(ip),true,ip);
  for(const ip of ['',null,'256.1.2.3','01.2.3.4','1.2.3','1.2.3.4/24','1.2.3.4:80','::1%eth0','[::1]',':::1',"' OR 1=1 --",'<script>',' ::1','2001:db8::g'])assert.equal(validIpAddress(ip),false,String(ip));
  for(const q of ['address=::1&snapshot=no','address=::1&p=0','address=::1&limit=999','address=::1&p=9007199254740992','address=::1&address=::2','address=::1&snapshot=0&snapshot=1'])assert.equal(ipActivityParams(new URLSearchParams(q)),null,q);
  for(const url of ['https://evil.example/analytics','//evil.example/analytics','/analytics/ip?address=::1','/analytics/../published','/analytics\n?ip=x'])assert.equal(analyticsBack(url),'/analytics');
});

test('IP history uses a constant query count, bounded pages and all-retained totals without writes',async()=>{
  const db=seed();let calls=0;const prepare=db.prepare.bind(db);db.prepare=sql=>{calls++;return prepare(sql);};
  const before=db.sqlite.prepare('SELECT total_changes() n').get().n;
  const first=await ipActivity(db,{address:IP,limit:50});
  assert.equal(calls,3);assert.equal(first.totals.events,130);assert.equal(first.totals.active_days,130);assert.equal(first.totals.pages,1);assert.equal(first.history.total,130);assert.equal(first.history.rows.length,50);
  const last=await ipActivity(db,{address:IP,limit:50,p:9999,snapshot:first.history.snapshot});
  assert.equal(last.history.current,3);assert.equal(last.history.rows.length,30);
  const ids=[];for(let p=1;p<=3;p++)ids.push(...(await ipActivity(db,{address:IP,limit:50,p,snapshot:first.history.snapshot})).history.rows.map(r=>r.id));
  assert.deepEqual(ids,Array.from({length:130},(_,i)=>i+1));assert.equal(new Set(ids).size,130);
  assert.equal(db.sqlite.prepare('SELECT total_changes() n').get().n,before);
  const plan=db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM visitor_events WHERE ip=?').all(IP);
  assert.ok(plan.some(r=>/SEARCH .* USING .*INDEX idx_ve_ip_/.test(r.detail)));
});

test('chronological pages handle equal timestamps and out-of-order imported records without duplication',async()=>{
  const db=seed(130);
  db.sqlite.prepare('UPDATE visitor_events SET occurred_at=? WHERE ip=? AND id%2=0').run(NOW,IP);
  const expected=db.sqlite.prepare('SELECT id FROM visitor_events WHERE ip=? ORDER BY occurred_at DESC,id DESC').all(IP).map(r=>r.id);
  const first=await ipActivity(db,{address:IP,limit:25});const ids=[];
  for(let p=1;p<=first.history.pages.length;p++)ids.push(...(await ipActivity(db,{address:IP,limit:25,p,snapshot:first.history.snapshot})).history.rows.map(r=>r.id));
  assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,130);
});

test('new events do not shift IP history snapshots, while current retained totals remain explicit',async()=>{
  const db=seed(51);const initial=await ipActivity(db,{address:IP,limit:25});
  db.sqlite.prepare("INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,ip,path,page,automation) VALUES('aw:new','native',?,'2026-10-15',?,?,'/','/','human')").run(NOW,NOW,IP);
  const frozen=await ipActivity(db,{address:IP,limit:25,snapshot:initial.history.snapshot});
  assert.equal(frozen.totals.events,52);assert.equal(frozen.history.total,51);assert.deepEqual(frozen.history.rows.map(r=>r.id),initial.history.rows.map(r=>r.id));
});

test('IP detail requires the same owner authentication before parsing input or querying D1',async()=>{
  const db=seed(1),get=router(db);let calls=0;const prepare=db.prepare.bind(db);db.prepare=sql=>{calls++;return prepare(sql);};
  assert.equal((await get('/analytics/ip?address=bad',null)).status,401);
  assert.equal((await get('/analytics/ip?address='+IP,signer.sign({email:'other@example.com',iat:NOW-10,nbf:NOW-10,exp:NOW+3600}))).status,403);
  assert.equal((await get('/analytics/ip?address=%27%20OR%201=1')).status,400);
  assert.equal(calls,0);
});

test('IP detail escapes raw fields, preserves back/pagination/snapshot, and offers matching exports',async()=>{
  const db=seed(),get=router(db);const back='/analytics?country=ger&range=30d&p=3&snapshot=131';
  const url='/analytics/ip?'+new URLSearchParams({address:IP,p:'2',limit:'25',snapshot:'131',back});
  const response=await get(url);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const html=await response.text();assert.doesNotMatch(html,/<script>|<svg/);assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(response.headers.get('Content-Security-Policy'),/script-src/);
  const {document}=parseHTML(html);const link=[...document.querySelectorAll('a')].find(a=>a.textContent==='Back to Analytics');assert.equal(link.getAttribute('href'),back);
  for(const label of ['First','Previous','Next','Last']){const a=[...document.querySelectorAll('[aria-label="IP activity pages"] a')].find(a=>a.textContent===label);assert.ok(a,label);const u=new URL(a.getAttribute('href'),'https://boss.example');assert.equal(u.searchParams.get('back'),back);assert.equal(u.searchParams.get('snapshot'),'131');}
  const csv=document.querySelector('a[href^="/analytics/export"]');const params=new URL(csv.getAttribute('href'),'https://boss.example').searchParams;
  assert.equal(params.get('ip'),IP);assert.equal(params.get('snapshot'),'131');
  const data=await (await exportResponse(db,'ndjson',{filters:parseFilters(params,NOW)},'ip.ndjson')).text();const rows=data.trim().split('\n').map(JSON.parse);assert.equal(rows.length,130);assert.ok(rows.every(r=>r.ip===IP));
  assert.match(html,/not a person or session/);assert.match(html,/nothing is deleted automatically/i);
});

test('every valid IP and IP Visits link opens the same address with exact view continuity',async()=>{
  const db=seed(2),f=parseFilters(new URLSearchParams('country=ger&limit=25'),NOW);const plan=await pagination(db,f);f.snapshot=plan.snapshot;f.p=plan.current;
  const html=renderAnalytics({identity:{email:'owner@example.com'},f,sum:await summary(db,f),tops:{page:[],country:[],referrer:[],agent:[]},streamPage:await numberedStream(db,f,plan),retention:await retentionStatus(db,NOW),coverage:[],corpora:[],outbox:[]});
  const {document}=parseHTML(html);assert.ok(document.querySelector('main.analytics-workspace'));
  for(const row of document.querySelectorAll('.events-table tbody tr')){const ip=row.querySelector('[data-label="IP ADDRESS"] a'),count=row.querySelector('[data-label="IP VISITS"] a');assert.ok(ip);assert.ok(count);assert.equal(ip.getAttribute('href'),count.getAttribute('href'));const u=new URL(ip.getAttribute('href'),'https://boss.example');assert.equal(u.searchParams.get('address'),IP);assert.equal(new URL(u.searchParams.get('back'),'https://boss.example').searchParams.get('country'),'ger');assert.equal(u.searchParams.get('snapshot'),String(plan.snapshot));}
});

test('valid addresses with no retained data and zero snapshots have useful empty states',async()=>{
  const get=router(seed(1));for(const query of ['address=192.0.2.33','address='+encodeURIComponent(IP)+'&snapshot=0']){const r=await get('/analytics/ip?'+query);assert.equal(r.status,200);const html=await r.text();assert.match(html,/No retained events/);assert.doesNotMatch(html,/Dec 31, 1969/);}
});
