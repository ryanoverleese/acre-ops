// Run after npm run build. Playwright must be available locally or via NODE_PATH.
// All data is synthetic; the isolated server blocks external fetches.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { encode } from 'next-auth/jwt';
import { EQUIPMENT_TABS, LEGACY_EQUIPMENT_ROUTES, getEquipmentTab } from '../../lib/equipment-navigation.ts';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const artifacts = await mkdtemp(`${tmpdir()}/acre-equipment-qa-`);
const base = 'http://127.0.0.1:3197';
const secret = 'equipment-local-fixture-secret-not-for-production';
let output = '', browser, server, page, authCookie = '';
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
try {
  let occupied = false;
  try { await fetch(base, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
  assert(!occupied, 'Test port 3197 is already occupied');
  // Isolate Next's runtime caches as well as the database fixtures.
  const testRoot = `${artifacts}/app`;
  await mkdir(testRoot);
  await cp(`${root}/.next`, `${testRoot}/.next`, { recursive: true, filter: source => source !== `${root}/.next/cache` });
  await cp(`${root}/package.json`, `${testRoot}/package.json`);
  await cp(`${root}/next.config.js`, `${testRoot}/next.config.js`);
  await symlink(`${root}/node_modules`, `${testRoot}/node_modules`, 'dir');
  server = spawn(process.execPath, ['--require', `${root}/tests/supabase/browser-preload.cjs`, `${root}/node_modules/next/dist/bin/next`, 'start', '--hostname', '127.0.0.1', '--port', '3197'], {
    cwd: testRoot, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, ACRE_SUPABASE_BROWSER: '1', ACRE_EQUIPMENT_TEST: '1', AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: 'true', NEXT_TELEMETRY_DISABLED: '1' },
  });
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
    assert(server.exitCode === null, output);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, 'Test server did not start');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/log-removal') return route.fulfill({ json: { success: true } });
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      const body = await response.text().catch(() => '[page closed before response body was read]');
      console.error('Fixture API failure', response.status(), new URL(response.url()).pathname, body);
    }
  });
  page.on('request', request => {
    if (['POST', 'PATCH', 'DELETE'].includes(request.method())) mutations.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  await check('authentication remains required', async () => {
    await page.goto(`${base}/equipment`);
    assert.equal(new URL(page.url()).pathname, '/login');
  });
  const session = async (role, targetContext = context) => {
    const value = await encode({ token: { name: 'Equipment QA', email: 'qa@example.invalid', role, id: '1', backend: 'supabase-native-v1' }, secret, salt: 'acre-auth-supabase-v1' });
    authCookie = `acre-auth-supabase-v1=${value}`;
    await targetContext.addCookies([{ name: 'acre-auth-supabase-v1', value, url: base, httpOnly: true }]);
  };
  await session('admin');
  await check('four tabs, one Equipment menu item, working probe search', async () => {
    await page.goto(`${base}/equipment`);
    await page.getByRole('heading', { name: 'Equipment', exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('navigation', { name: 'Equipment sections' }).getByRole('link').allTextContents(), EQUIPMENT_TABS.map(tab => tab.label));
    assert.equal(await page.locator('.sidebar').getByRole('link', { name: 'Equipment', exact: true }).count(), 1);
    for (const name of ['Probes', 'Racks', 'Inventory', 'Weather Stations']) assert.equal(await page.locator('.sidebar').getByRole('link', { name, exact: true }).count(), 0);
    await page.getByPlaceholder('Search probes...').fill('400001');
    await page.locator('table').getByText('#400001', { exact: true }).waitFor();
    await page.screenshot({ path: `${artifacts}/desktop.png` });
  });
  await check('old bookmarks and query strings reach the correct tab', async () => {
    for (const [oldPath, newPath] of Object.entries(LEGACY_EQUIPMENT_ROUTES)) {
      await page.goto(`${base}${oldPath}?qa=kept`);
      assert.equal(new URL(page.url()).pathname, newPath);
      assert.equal(new URL(page.url()).searchParams.get('qa'), 'kept');
      assert.equal(await page.locator('.equipment-tab[aria-current="page"]').innerText(), EQUIPMENT_TABS.find(tab => tab.id === getEquipmentTab(newPath)).label);
      assert(await page.locator('.sidebar a[href="/equipment"]').evaluate(el => el.classList.contains('active')));
    }
    await page.getByText('QA Weather', { exact: true }).first().waitFor();
    await page.goto(`${base}/equipment/supplies`);
    await page.getByText('QA Antennas', { exact: true }).first().waitFor();
  });
  await check('rack move and undo', async () => {
    await page.goto(`${base}/equipment/racks`);
    await page.getByText('400001', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Move Location', exact: true }).click();
    await page.getByText('Rack 1A · Slot 2', { exact: true }).click();
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/equipment/actions' && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Undo', exact: true }).click(),
    ]);
    await page.getByRole('button', { name: /Undo/ }).waitFor({ state: 'hidden' });
    assert(mutations.some(m => m.path === '/api/equipment/actions' && m.body.probeId === 11 && m.body.destinationId === 502));
    assert(mutations.some(m => m.path === '/api/equipment/actions' && m.body.probeId === 11 && m.body.destinationId === 501));
  });
  await check('registration reuses the on-order record and returns to Equipment', async () => {
    await page.goto(`${base}/equipment`);
    await page.getByRole('link', { name: '+ Register probe', exact: true }).click();
    await page.getByPlaceholder('e.g. 412719').fill('499999');
    await page.getByRole('button', { name: /Probe #13/ }).click();
    await page.getByRole('button', { name: 'Assign #499999 to On Order Slot' }).click();
    await page.getByText('Probe registered!', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Equipment', exact: true }).click();
    await page.waitForURL(`${base}/equipment`);
    assert(mutations.some(m => m.path === '/api/probes/13' && m.body.serial_number === '499999'));
  });
  await check('RMA blocks duplicates, retains history, and never deletes the old probe', async () => {
    await page.getByRole('link', { name: 'Replace failed probe (RMA)', exact: true }).click();
    await page.getByText('CropX #400001', { exact: true }).click();
    await page.getByPlaceholder('e.g. 412719').fill('400002');
    const before = mutations.length;
    await page.getByRole('button', { name: 'Confirm Swap', exact: true }).click();
    await page.getByText(/That serial number is already registered/).waitFor();
    assert.equal(mutations.length, before);
    await page.getByPlaceholder('e.g. 412719').fill('499998');
    await page.getByRole('button', { name: 'Confirm Swap', exact: true }).click();
    await page.getByText('Swap complete!', { exact: true }).waitFor();
    assert(mutations.some(m => m.path === '/api/equipment/actions' && m.body.action === 'rma' && m.body.probeId === 11));
    assert(!mutations.some(m => m.method === 'DELETE' || m.path === '/api/probe-assignments/200'));
    const oldResponse = await context.request.get(`${base}/api/probes/11`, {headers:{Cookie:authCookie}});
    const old = await oldResponse.json();
    assert.equal(oldResponse.status(),200,JSON.stringify(old));
    assert.equal(old.notes, 'Keep this history');
    assert.equal(old.status.value, 'RMA');
  });
  await check('tablet and phone layouts', async () => {
    for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${base}/equipment/racks`);
      const nav = page.getByRole('navigation', { name: 'Equipment sections' });
      const bounds = await nav.boundingBox();
      assert(await nav.isVisible());
      assert(bounds.y >= 55 && bounds.y + bounds.height < viewport.height);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${artifacts}/${viewport.width}.png` });
    }
  });
  await check('billing shows a saved 50/50 charge under each linked entity', async () => {
    const partnerResponse = await context.request.post(`${base}/api/billing-entities`, {headers:{Cookie:authCookie},data:{name:'QA Split Partner'}});
    assert.equal(partnerResponse.status(),200,await partnerResponse.text());
    const partner = await partnerResponse.json();
    const linkResponse = await context.request.patch(`${base}/api/fields/1`,{headers:{Cookie:authCookie},data:{billing_entity:[1,partner.id]}});
    assert.equal(linkResponse.status(),200,await linkResponse.text());
    const enroll = await context.request.post(`${base}/api/billing/enroll`,{headers:{Cookie:authCookie},data:{field_season_id:101,season:new Date().getFullYear(),rate:300,quantity:1,service_type:'Fixture'}});
    assert.equal(enroll.status(),200,await enroll.text());
    assert.deepEqual((await enroll.json()).charges.map(charge=>charge.rate),[150,150]);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${base}/billing`);
    for (const name of ['QA Billing','QA Split Partner']) {
      const row = page.locator('tr').filter({has:page.getByRole('cell',{name,exact:true})});
      await row.locator('.expand-chevron').click();
    }
    const details = page.locator('.line-items-table tbody tr').filter({hasText:'QA Field'});
    assert.equal(await details.count(),2);
    for (const row of await details.all()) {
      assert.match(await row.innerText(),/1\/2 share \(50%\)/);
      assert.equal(await row.getByRole('cell',{name:'$150.00',exact:true}).count(),1);
      assert.match(await row.innerText(),/\$300.00/);
      assert(!/not yet charged/.test(await row.innerText()));
    }
    await page.screenshot({path:`${artifacts}/billing-split.png`});
  });
  await check('shared quantity edits never compound, including after a page reload', async () => {
    const quantity = () => page.getByRole('spinbutton',{name:'Field quantity for QA Field'}).first();
    await quantity().fill('2');
    await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/billing/enroll' && response.request().method()==='POST'),
      quantity().press('Tab'),
    ]);
    await page.waitForFunction(()=>[...document.querySelectorAll('input[aria-label="Field quantity for QA Field"]')].every(input=>input.value==='2'));
    const checkTotal = async () => {
      const response=await context.request.get(`${base}/api/invoice-lines`,{headers:{Cookie:authCookie}});
      assert.equal(response.status(),200);
      const rows=(await response.json()).filter(row=>row.field_season[0]?.id===101);
      assert.equal(rows.length,2);
      assert.equal(rows.reduce((sum,row)=>sum+row.rate*row.quantity,0),600);
      assert(rows.every(row=>row.field_unit_rate===300 && row.field_quantity===2));
    };
    await quantity().fill('2'); await quantity().press('Tab'); await checkTotal();
    await page.reload();
    for (const name of ['QA Billing','QA Split Partner']) await page.locator('tr').filter({has:page.getByRole('cell',{name,exact:true})}).locator('.expand-chevron').click();
    assert.equal(await quantity().inputValue(),'2');
    await quantity().fill('2'); await quantity().press('Tab'); await checkTotal();
  });
  await check('shared Fields billing displays every entity and detail saves preserve the complete join', async () => {
    const readField=async()=>{
      const response=await context.request.get(`${base}/api/fields/1`,{headers:{Cookie:authCookie}});
      assert.equal(response.status(),200); return response.json();
    };
    const original=await readField();
    const ids=original.billing_entity.map(link=>link.id);
    assert.equal(ids.length,2);
    await page.goto(`${base}/fields`);
    await page.getByRole('button',{name:'Signup',exact:true}).click();
    const sharedButton=()=>page.locator('table').getByRole('button',{name:'QA Billing / QA Split Partner',exact:true});
    await sharedButton().waitFor();
    await sharedButton().click();
    const panel=page.locator('.detail-panel');
    await panel.getByRole('button',{name:'Edit Field',exact:true}).click();
    await panel.getByRole('button',{name:'2 selected',exact:true}).click();
    await page.locator('.searchable-select-option input:checked').first().waitFor();
    assert.equal(await page.locator('.searchable-select-option input:checked').count(),2);
    await page.locator('.searchable-select-option').filter({hasText:'QA Split Partner'}).getByRole('checkbox').uncheck();
    await page.locator('.searchable-select-dropdown').getByRole('button',{name:'Close',exact:true}).click();
    await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    await panel.getByRole('button',{name:'Edit Field',exact:true}).click();
    await panel.getByRole('button',{name:'2 selected',exact:true}).waitFor();
    await panel.locator('.form-group').filter({has:page.locator('label').filter({hasText:/^Notes$/})}).locator('textarea').fill('Shared field detail QA');
    const [saved]=await Promise.all([
      page.waitForResponse(response=>new URL(response.url()).pathname==='/api/fields/1'&&response.request().method()==='PATCH'),
      panel.getByRole('button',{name:'Save Changes',exact:true}).click(),
    ]);
    assert.equal(saved.status(),200,await saved.text());
    assert.deepEqual(saved.request().postDataJSON().billing_entity,ids);
    await panel.getByRole('button',{name:'Edit Field',exact:true}).waitFor();
    assert.deepEqual((await readField()).billing_entity,original.billing_entity);
    assert.equal((await readField()).notes,'Shared field detail QA');
    await page.reload();
    await sharedButton().waitFor();
    await sharedButton().click();
    await panel.getByText('Shared field detail QA',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'Edit Field',exact:true}).click();
    await panel.getByRole('button',{name:'2 selected',exact:true}).click();
    await page.locator('.searchable-select-option input:checked').first().waitFor();
    assert.equal(await page.locator('.searchable-select-option input:checked').count(),2);
    await page.locator('.searchable-select-dropdown').getByRole('button',{name:'Close',exact:true}).click();
    await page.screenshot({path:`${artifacts}/shared-field-details.png`});
  });
  await check('installer access remains unchanged', async () => {
    // Separate accounts need separate cookie jars: an in-flight admin request
    // may rotate its session cookie after a same-context role switch.
    const installerContext = await browser.newContext();
    await installerContext.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    try {
      await session('installer', installerContext);
      const installerPage = await installerContext.newPage();
      installerPage.on('pageerror', error => errors.push(error.message));
      const sessionResponse = await installerContext.request.get(`${base}/api/auth/session`);
      assert.equal((await sessionResponse.json()).user.role, 'installer');
      for (const route of ['/equipment', '/equipment/register', '/equipment/replace', '/racks']) {
        await installerPage.goto(`${base}${route}`);
        assert.equal(new URL(installerPage.url()).pathname, '/install');
      }
    } finally { await installerContext.close(); }
  });
  await check('no browser runtime errors', async () => assert.deepEqual(errors, []));
  console.log(JSON.stringify({ passed, artifacts }));
} catch (error) {
  console.error(error);
  if (page) await page.screenshot({ path: `${artifacts}/failure.png` }).catch(() => {});
  console.error(`Artifacts: ${artifacts}`);
  process.exitCode = 1;
} finally {
  await writeFile(`${artifacts}/server.log`, output);
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
}
