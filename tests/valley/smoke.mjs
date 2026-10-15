// Production-built UI with synthetic PostgreSQL fixtures and mocked Valley GETs.
// No live logins, API credentials, external requests or database writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {cp,mkdir,mkdtemp,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {encode} from 'next-auth/jwt';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const artifacts=await mkdtemp(`${tmpdir()}/acre-valley-qa-`);
const base='http://localhost:3199', secret='valley-fixture-only-not-production';
let server,browser,output='',passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try {
  let occupied=false;try{await fetch(base,{signal:AbortSignal.timeout(500)});occupied=true;}catch{}
  assert(!occupied,'Test port 3199 already occupied');
  const testRoot=artifacts+'/app';await mkdir(testRoot);
  await cp(root+'/.next',testRoot+'/.next',{recursive:true,filter:source=>source!==root+'/.next/cache'});
  await cp(root+'/package.json',testRoot+'/package.json');await cp(root+'/next.config.js',testRoot+'/next.config.js');
  await symlink(root+'/node_modules',testRoot+'/node_modules','dir');
  server=spawn(process.execPath,['--require',root+'/tests/supabase/browser-preload.cjs',root+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3199'],{
    cwd:testRoot,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,ACRE_SUPABASE_BROWSER:'1',ACRE_EQUIPMENT_TEST:'1',AUTH_SECRET:secret,NEXTAUTH_SECRET:secret,AUTH_URL:base,NEXTAUTH_URL:base,AUTH_TRUST_HOST:'true',NEXT_TELEMETRY_DISABLED:'1',VALLEY_READ_ONLY_ENABLED:'true'},
  });
  server.stdout.on('data',data=>output+=data);server.stderr.on('data',data=>output+=data);
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}assert.equal(server.exitCode,null,output);await new Promise(r=>setTimeout(r,200));}
  assert(ready,'Test server did not start');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const token=await encode({token:{name:'QA Admin',email:'qa@example.invalid',role:'admin',id:'1',backend:'supabase-native-v1'},secret,salt:'acre-auth-supabase-v1'});
  await context.addCookies([{name:'acre-auth-supabase-v1',value:token,url:base,httpOnly:true}]);
  const at=Date.now();let power='ON',age='recent',unavailable=false,calls=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname==='/api/valley/status'){
      calls.push({method:route.request().method(),fields:url.searchParams.get('fields')});
      if(unavailable)return route.fulfill({status:503,json:{error:'Unavailable'}});
      const fields=Object.fromEntries(url.searchParams.get('fields').split(',').map(id=>[id,{state:'ready',pivots:[{serial:'12345',name:'QA Pivot',angle:90,power,direction:'FWD',isLateral:false,reportedLocalTime:'10/15/2026 10:00:00',observedAt:age==='unknown'?null:new Date(at).toISOString(),behind:age==='old'}]}]));
      return route.fulfill({json:{enabled:true,fields}});
    }
    if(url.pathname==='/api/gdu')return route.fulfill({json:{gdu:0}});
    return route.continue();
  });
  await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});});
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date(at)});
  await check('icon is next to the field, gives position/power/direction and has no controls',async()=>{
    await page.goto(base+'/water-recs');
    await page.locator('.wr-field-name [data-power="ON"]').waitFor();
    assert.match((await page.locator('.wr-field-name').first().innerText()).replace(/\s+/g,' '),/^QA Field\s*ON\s+FWD/);
    assert.equal(await page.locator('[data-valley-readonly] button').count(),0);
    assert.equal(await page.locator('[data-valley-readonly] [role="img"]').getAttribute('data-freshness'),'recent');
    assert((await page.locator('[data-valley-readonly] [role="img"]').getAttribute('aria-label')).includes('90° from north'));
    assert(calls.length>0 && calls.every(call=>call.method==='GET' && call.fields==='1'));
    await page.screenshot({path:artifacts+'/desktop.png'});
  });
  await check('refresh updates badge only, preserves typed recommendation and copied report',async()=>{
    await page.locator('.wr-priority-btn').first().click();
    await page.locator('.wr-rec-textarea').first().fill('Keep this recommendation draft.');
    power='OFF';const before=calls.length;await page.clock.fastForward(300000);
    await page.locator('[data-power="OFF"]').waitFor();assert(calls.length>before);
    assert.equal(await page.locator('.wr-rec-textarea').first().inputValue(),'Keep this recommendation draft.');
    await page.getByRole('button',{name:'Copy All',exact:true}).click();
    const copy=await page.evaluate(()=>window.__copied);
    assert(copy.includes('QA Field') && copy.includes('Keep this recommendation draft.'));
    assert(!/QA Pivot|FWD|OFF|12345|90°/.test(copy));
  });
  await check('old and unknown timestamps are visibly labeled; failure clears apparently current power',async()=>{
    age='old';await page.clock.fastForward(300000);await page.getByText('Old reading',{exact:true}).waitFor();
    age='unknown';await page.clock.fastForward(300000);await page.getByText('Age unknown',{exact:true}).waitFor();
    unavailable=true;await page.clock.fastForward(300000);await page.getByText('Pivot unavailable',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-power]').count(),0);
    unavailable=false;age='recent';await page.clock.fastForward(300000);await page.locator('[data-power="OFF"]').waitFor();
  });
  await check('the same readout appears in the late-week view',async()=>{
    await page.getByRole('button',{name:'Water Day Update',exact:true}).click();
    await page.locator('.wr-update-field-info [data-power="OFF"]').waitFor();
  });
  await check('tablet and phone keep the compact readout visible without page overflow',async()=>{
    for(const viewport of [{width:768,height:1024},{width:390,height:844}]){
      await page.setViewportSize(viewport);
      const badge=page.locator('[data-valley-readonly]');assert(await badge.isVisible());
      const bounds=await badge.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=viewport.width);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`${artifacts}/${viewport.width}.png`});
    }
  });
  await check('no browser exceptions and no Valley write request',async()=>{assert.deepEqual(errors,[]);assert(calls.every(call=>call.method==='GET'));});
  console.log(JSON.stringify({passed,artifacts}));
} finally {await browser?.close();server?.kill('SIGTERM');}
