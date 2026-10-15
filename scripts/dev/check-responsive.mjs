// Local rendered-layout regression checks. Requires Playwright (or PLAYWRIGHT_MODULE), and a Chromium browser (optional CHROME_PATH).
// Uses built dist by default; --baseline compares the previous frozen DOM with the current CSS. All remote browser requests are blocked.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {D1Sqlite} from '../../tests/helpers/d1-sqlite.mjs';
import {FakeGitHub} from '../../tests/helpers/fake-github.mjs';
import {makeSigner,TEAM,AUD} from '../../tests/helpers/access-jwt.mjs';
import {createBoss} from '../../workers/boss/src/index.mjs';
import {syntheticAnalyticsSql} from './synthetic-data.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const db=D1Sqlite.analytics(),now=Math.floor(Date.now()/1000);
await db.exec((await syntheticAnalyticsSql({pages:['/','/about/','/item/test/'],now})).sql);
db.sqlite.prepare(`INSERT INTO visitor_events(event_uid,origin,occurred_at,la_day,received_at,ip,country,country_code,path,page,referrer,referrer_raw,user_agent,automation,device_class,browser,os) VALUES('aw:ipv6','native',?,'2026-10-15',?,'2001:db8:abcd:1234:5678:90ab:cdef:1234','Germany','DE',?,?,'Extremely long referral source',?,'Long synthetic user agent <script> sample','human','desktop','Firefox','Windows')`).run(now,now,'/item/'+ 'long-path-'.repeat(40),'/item/test/','https://example.com/'+ 'referrer-'.repeat(60));
const signer=makeSigner('responsive-local'),gh=new FakeGitHub({'src/data/published.json':fs.readFileSync('src/data/published.json','utf8'),'src/data/pending.json':fs.readFileSync('src/data/pending.json','utf8'),'src/data/fetch-status.json':fs.readFileSync('src/data/fetch-status.json','utf8')});
const env={ENVIRONMENT:'local',APP_DB:D1Sqlite.app(),ANALYTICS_DB:db,BOSS_ACCESS_TEAM_DOMAIN:TEAM,BOSS_ACCESS_AUD:AUD,BOSS_ALLOWED_EMAILS:'hakan@dndr.net',BOSS_CSRF_SECRET:'synthetic-only',GITHUB_TOKEN:'synthetic-only',BOSS_GITHUB_REPOSITORY:'hakandndr/americawhat-staging-content',BOSS_GITHUB_BRANCH:'content-staging',BOSS_COMMIT_AUTHOR_NAME:'Hakan Dundar',BOSS_COMMIT_AUTHOR_EMAIL:'hakan@dndr.net'};
const boss=createBoss({fetchImpl:async(url,init)=>String(url).includes('/cdn-cgi/access/certs')?new Response(JSON.stringify({keys:[signer.jwk]})):gh.fetch(url,init)});
const report={footer:[],analytics:[],related:[],interactions:[]};
const staticRoot=path.resolve(!process.argv.includes('--baseline')?'dist':'reports/predeploy-candidate/dist');
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(/^\/(analytics|assets\/analytics.js|review|published|reactions|audit|health)(\/|$)/.test(url.pathname)){
      const response=await boss.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{headers:{'Cf-Access-Jwt-Assertion':signer.sign()}}),env,{});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    let filename=path.resolve(staticRoot,'.'+decodeURIComponent(url.pathname));
    if(!filename.startsWith(staticRoot+path.sep)&&filename!==staticRoot){res.writeHead(404);res.end();return;}
    if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
    if(!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
    let bytes=fs.readFileSync(filename);
    const ext=path.extname(filename);const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};
    if(ext==='.html'&&!!process.argv.includes('--baseline')&&url.searchParams.get('layout')!=='before')bytes=Buffer.from(bytes.toString().replace('</head>',`<style>${fs.readFileSync('src/styles/global.css','utf8')}</style></head>`));
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(bytes);
  }catch(error){res.writeHead(500);res.end('Local test failed');console.error(error.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
try{
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  if(!!process.argv.includes('--baseline')){
    await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/about/?layout=before');
    report.beforeFooter=await page.locator('.site-foot').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,viewport:innerHeight}));
    const spacing=()=>({mainTop:document.querySelector('main').getBoundingClientRect().top,heroHeight:document.querySelector('.hero').getBoundingClientRect().height,footerTop:document.querySelector('.site-foot').getBoundingClientRect().top});
    await page.goto(origin+'/?layout=before');const before=await page.evaluate(spacing);
    await page.goto(origin+'/');const after=await page.evaluate(spacing);
    for(const key of Object.keys(before))assert.ok(Math.abs(before[key]-after[key])<1,`Homepage spacing changed: ${key}`);
    report.homepageSpacingUnchanged=true;
  }
  for(const [width,height]of [[390,844],[768,1024],[1440,1000],[1920,1080]]){
    await page.setViewportSize({width,height});
    for(const route of ['/about/','/category/','/contact/','/','/archive/']){
      await page.goto(origin+route);const metrics=await page.evaluate(()=>{const f=document.querySelector('.site-foot').getBoundingClientRect(),m=document.querySelector('main').getBoundingClientRect();return {footerBottom:f.bottom+scrollY,footerTop:f.top+scrollY,mainBottom:m.bottom+scrollY,documentHeight:document.documentElement.scrollHeight,viewport:innerHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth};});
      assert.ok(metrics.scrollWidth<=width+1,`Public overflow ${route} ${width}`);assert.ok(metrics.footerTop>=metrics.mainBottom-1,`Footer overlap ${route}`);assert.ok(Math.abs(metrics.footerBottom-metrics.documentHeight)<=2,`Blank below footer ${route} ${width}`);assert.ok(metrics.footerBottom>=height-1,`Footer above viewport ${route} ${width}`);report.footer.push({route,width,...metrics});
    }
    await page.goto(origin+'/analytics?country=ger&limit=25');
    await page.waitForSelector('.events-table tbody a.ip-link');
    const measurements=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tableWidth:document.querySelector('.events-table').clientWidth,tableScroll:document.querySelector('.events-table').scrollWidth,rowMode:getComputedStyle(document.querySelector('.events-table tbody tr')).display,ipColor:getComputedStyle(document.querySelector('.ip-link')).color}));
    assert.ok(measurements.scrollWidth<=width+1,`Analytics overflow ${width}`);assert.ok(measurements.tableScroll<=measurements.tableWidth+1,`Table overflow ${width}`);assert.equal(measurements.ipColor,'rgb(143, 180, 236)');report.analytics.push(measurements);
    await page.locator('.events-table details summary').first().click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Expanded row overflow ${width}`);
    if([390,1440].includes(width))await page.screenshot({path:`reports/overnight-analytics-${width}.png`,fullPage:false});
    for(const route of ['/review','/published','/reactions','/audit','/health']){await page.goto(origin+route);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Related page overflow ${route} ${width}`);report.related.push({route,width,overflow:false});}
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/analytics?country=ger&limit=25&p=2');
  await page.locator('#f-country').fill('united');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('country')==='united' && document.getElementById('analytics-status').textContent==='Updated.');
  assert.equal(new URL(page.url()).searchParams.get('p'),'1');
  await page.getByRole('link',{name:'Last',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('analytics-status').textContent==='Updated.' && Number(new URL(location.href).searchParams.get('p'))>1);
  await page.getByRole('link',{name:'First',exact:true}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('p')==='1' && document.getElementById('analytics-status').textContent==='Updated.');
  report.interactions.push('live country filter, numeric Last and First navigation');
  const backUrl=page.url();const link=page.locator('[data-label="IP address"] a').first();await link.focus();await page.keyboard.press('Enter');await page.waitForURL('**/analytics/ip?**');
  assert.ok(await page.getByRole('heading',{level:1}).textContent().then(t=>t.startsWith('IP activity')));const back=page.getByRole('link',{name:'Back to Analytics'});const returned=new URL(await back.getAttribute('href'),origin);assert.equal(returned.search,new URL(backUrl).search);await back.click();await page.waitForURL(url=>url.pathname==='/analytics');
  await page.locator('[data-label="IP Visits"] a').first().click();await page.waitForURL('**/analytics/ip?**');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));report.interactions.push('keyboard IP link, IP Visits and exact filter/page/snapshot Back');
  await page.screenshot({path:'reports/overnight-ip-desktop.png',fullPage:false});
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});await noJs.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const plain=await noJs.newPage();await plain.goto(origin+'/analytics?country=ger&limit=25');await plain.locator('[data-label="IP Visits"] a').first().click();await plain.waitForURL('**/analytics/ip?**');await plain.getByRole('link',{name:'Back to Analytics'}).click();assert.equal(new URL(plain.url()).searchParams.get('country'),'ger');report.interactions.push('no-JavaScript mobile drill-down and Back');
  report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(!process.argv.includes('--baseline')?'reports/overnight-browser-built.json':'reports/overnight-browser-local.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
