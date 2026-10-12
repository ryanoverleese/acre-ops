// Production-build smoke test. The server and browser both block external traffic.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { encode } from 'next-auth/jwt';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const artifacts = await mkdtemp(`${tmpdir()}/acre-removal-qa-`);
const base = 'http://127.0.0.1:3198';
const secret = 'removal-local-fixture-secret-not-for-production';
let server, browser, output = '', passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const snapshot = async () => JSON.parse(await readFile(`${artifacts}/state.json`, 'utf8'));
const post = async values => {
  const body = new FormData(); for (const [key, value] of Object.entries(values)) body.append(key, value);
  const response = await fetch(`${base}/api/removal`, { method: 'POST', body });
  return { status: response.status, data: await response.json() };
};
try {
  let occupied = false; try { await fetch(base, { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
  assert(!occupied, 'Test port 3198 is occupied');
  const testRoot = `${artifacts}/app`; await mkdir(testRoot);
  await cp(`${root}/.next`, `${testRoot}/.next`, { recursive: true, filter: path => path !== `${root}/.next/cache` });
  await cp(`${root}/package.json`, `${testRoot}/package.json`);
  await cp(`${root}/next.config.js`, `${testRoot}/next.config.js`);
  await symlink(`${root}/node_modules`, `${testRoot}/node_modules`, 'dir');
  server = spawn(process.execPath, ['--require', `${root}/tests/removal/baserow-fixture.cjs`, `${root}/node_modules/next/dist/bin/next`, 'start', '--hostname', '127.0.0.1', '--port', '3198'], {
    cwd: testRoot, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, ACRE_REMOVAL_TEST: '1', ACRE_REMOVAL_TEST_STATE: `${artifacts}/state.json`, BASEROW_API_TOKEN: 'removal-fixture-only', REMOVAL_WEBHOOK_URL: 'https://removal-webhook.example.invalid/removal', AUTH_SECRET: secret, NEXTAUTH_SECRET: secret, AUTH_URL: base, NEXTAUTH_URL: base, AUTH_TRUST_HOST: 'true', NEXT_TELEMETRY_DISABLED: '1' },
  });
  server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
    assert(server.exitCode === null, output); await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(ready, 'Test server did not start');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const value = await encode({ token: { name: 'Removal QA', email: 'qa@example.invalid', role: 'admin', id: 'qa' }, secret, salt: 'authjs.session-token' });
  await context.addCookies([{ name: 'authjs.session-token', value, url: base, httpOnly: true }]);
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (['POST', 'PATCH', 'DELETE'].includes(request.method())) requests.push(new URL(request.url()).pathname); });
  page.setDefaultTimeout(15000);
  await check('Workflows shows only current unremoved installations and requires the actual remover', async () => {
    await page.goto(`${base}/workflows`);
    await page.getByText('Uninstall Probe', { exact: true }).click();
    assert.equal(await page.getByText(/Historical/).count(), 0);
    await page.getByText('QA Field — NE', { exact: true }).click();
    assert(await page.getByRole('button', { name: 'Confirm Removal', exact: true }).isDisabled());
    await page.getByLabel('Who pulled it?').fill('Brandon');
    await page.getByLabel('Removal date', { exact: true }).fill('2026-10-11');
    await page.screenshot({ path: `${artifacts}/desktop-form.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    // Let the existing responsive sidebar transition finish after resizing.
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1
      && document.querySelector('#uninstall-removed-by').getBoundingClientRect().width > 250);
    assert(await page.getByLabel('Who pulled it?').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${artifacts}/phone-form.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('Workflows saves the removal without any webhook and leaves the field sibling/planning untouched', async () => {
    await page.getByRole('button', { name: 'Confirm Removal', exact: true }).click();
    await page.getByText('Probe removed', { exact: true }).waitFor();
    assert.deepEqual(requests, ['/api/removal']);
    const { tables, writes, webhooks } = await snapshot();
    assert.deepEqual(webhooks, [], 'Workflows must not send the CropX removal webhook');
    const selected = tables[819350].find(row => row.id === 201), sibling = tables[819350].find(row => row.id === 202);
    assert.equal(selected.probe_status.value, 'Removed'); assert.equal(selected.removal_date, '2026-10-11'); assert.equal(selected.removed_by, 'Brandon');
    assert.equal(selected.planned_remover, 'Carter'); assert.equal(tables[817300][0].planned_remover.value, 'Carter');
    assert.equal(sibling.probe_status.value, 'Installed'); assert.equal(sibling.planned_remover, 'Ryan');
    assert.equal(tables[817299][0].status.value, 'In Stock'); assert.equal(tables[817299][1].status.value, 'Installed');
    assert.deepEqual(writes.map(({ table, id }) => [table, id]), [[819350, 201], [817299, 11]]);
  });
  await check('crew-shaped submission validates the remover and then saves the same states on its own probe', async () => {
    const before = await snapshot();
    assert.equal((await post({ probeAssignmentId: '202', removedBy: '  ' })).status, 400);
    assert.equal((await post({ probeAssignmentId: '202', removedBy: 'Ryan', source: 'workflow' })).status, 400);
    assert.equal((await post({ probeAssignmentId: '202', removedBy: 'Ryan', source: '' })).status, 400);
    assert.deepEqual(await snapshot(), before);
    const response = await post({ probeAssignmentId: '202', removedBy: 'Ryan' });
    assert.equal(response.status, 200); assert.equal(response.data.ok, true);
    const { tables, webhooks } = await snapshot();
    assert.equal(webhooks.length, 1, 'Existing crew clients must still notify');
    assert.equal(webhooks[0].assignment_id, 202);
    assert.equal(webhooks[0].source, 'acre-ops');
    assert.deepEqual(tables[819350][0], before.tables[819350][0]);
    assert.equal(tables[819350][1].probe_status.value, 'Removed'); assert.equal(tables[819350][1].removed_by, 'Ryan');
    assert.equal(tables[819350][1].removal_date, new Date().toISOString().slice(0, 10));
    assert.equal(tables[817299][1].status.value, 'In Stock');
  });
  await check('repeat submission returns original date/remover; no planning writes or browser errors', async () => {
    const before = await snapshot();
    const response = await post({ probeAssignmentId: '201', removedBy: 'Carter', removalDate: '2026-10-12', source: 'workflows' });
    assert.equal(response.status, 200); assert.equal(response.data.alreadyRemoved, true);
    assert.equal(response.data.removed_by, 'Brandon'); assert.equal(response.data.removal_date, '2026-10-11');
    const after = await snapshot(); assert.deepEqual(after.tables, before.tables);
    assert.deepEqual(after.webhooks, before.webhooks, 'Workflows retry must not notify');
    assert.equal((await post({ probeAssignmentId: '202', removedBy: 'Ryan', source: 'crew' })).status, 200);
    assert.deepEqual((await snapshot()).webhooks, before.webhooks, 'Crew retry must not notify again');
    assert(after.writes.every(write => !('planned_remover' in write.patch)));
    assert.deepEqual(errors, []);
  });
  console.log(`${passed} removal smoke checks passed. Artifacts: ${artifacts}`);
} finally {
  await browser?.close(); server?.kill('SIGTERM');
  await writeFile(`${artifacts}/server.log`, output, { mode: 0o600 });
}
