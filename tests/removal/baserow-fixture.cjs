// Synthetic records only. Never allow these tests to contact a real account.
if (process.env.ACRE_REMOVAL_TEST !== '1' || process.env.BASEROW_API_TOKEN !== 'removal-fixture-only') throw Error('Isolated removal test environment required');
const fs = require('node:fs');
const year = new Date().getFullYear();
const option = value => ({ value });
const link = (id, value = String(id)) => [{ id, value }];
const tables = {
  817294: [{ id: 1, name: 'QA Contact', operations: link(1), billing_entity: link(1) }],
  817295: [{ id: 1, name: 'QA Grower' }],
  817297: [{ id: 1, name: 'QA Billing' }],
  817298: [{ id: 1, name: 'QA Field', billing_entity: link(1) }],
  817299: [11, 12].map((id, i) => ({ id, serial_number: `40000${i + 1}`, brand: option('CropX'), status: option('Installed') })),
  817300: [{ id: 101, season: year, field: link(1), crop: option('Corn'), planned_remover: option('Carter') }, { id: 100, season: year - 1, field: link(1) }],
  819350: [
    { id: 201, probe: link(11, '400001'), field_season: link(101), label: 'NE', probe_status: option('Installed'), install_date: `${year}-05-01`, planned_remover: 'Carter' },
    { id: 202, probe: link(12, '400002'), field_season: link(101), label: 'SW', probe_status: option('Installed'), install_date: `${year}-05-01`, planned_remover: 'Ryan' },
    { id: 200, probe: link(11, '400001'), field_season: link(100), label: 'Historical', probe_status: option('Removed'), removal_date: `${year - 1}-10-01` },
  ],
};
const writes = [], webhooks = [];
const persist = () => fs.writeFileSync(process.env.ACRE_REMOVAL_TEST_STATE, JSON.stringify({ tables, writes, webhooks }), { mode: 0o600 });
persist();
const originalFetch = global.fetch;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = (init.method || input.method || 'GET').toUpperCase();
  // Capture a configured webhook locally without sending any network request.
  if (url.href === 'https://removal-webhook.example.invalid/removal' && method === 'POST') {
    webhooks.push(JSON.parse(init.body)); persist(); return json({ ok: true });
  }
  if (url.hostname !== 'api.baserow.io') {
    if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return originalFetch(input, init);
    throw Error('External network blocked in removal tests');
  }
  if (url.pathname.includes('/fields/table/') && method === 'GET') return json([]);
  const match = url.pathname.match(/^\/api\/database\/rows\/table\/(\d+)\/(\d+)?\/?$/);
  if (!match) return json({ error: 'Unsupported fixture endpoint' }, 400);
  const table = Number(match[1]), id = Number(match[2]);
  const rows = tables[table] || [];
  if (method === 'GET') {
    if (id) return rows.some(row => row.id === id) ? json(rows.find(row => row.id === id)) : json({ error: 'Not found' }, 404);
    return json({ count: rows.length, next: null, previous: null, results: rows });
  }
  // Unexpected writes (especially field-season/planning writes) fail closed.
  if (method !== 'PATCH' || ![817299, 819350].includes(table)) return json({ error: 'Unexpected fixture write' }, 405);
  const row = rows.find(row => row.id === id);
  if (!row) return json({ error: 'Not found' }, 404);
  const patch = JSON.parse(init.body);
  writes.push({ table, id, patch: structuredClone(patch) });
  for (const key of ['status', 'probe_status']) if (typeof patch[key] === 'string') patch[key] = option(patch[key]);
  Object.assign(row, patch); persist();
  return json(row);
};
