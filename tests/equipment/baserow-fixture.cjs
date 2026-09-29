// Local test preload: fail closed rather than contact a real account.
if (process.env.ACRE_EQUIPMENT_TEST !== '1' || process.env.BASEROW_API_TOKEN !== 'equipment-fixture-only') {
  throw new Error('Equipment fixtures require the isolated test environment.');
}
const year = new Date().getFullYear();
const option = value => ({ value });
const link = (id, value = String(id)) => [{ id, value }];
const tables = {
  817294: [{ id: 1, name: 'QA Contact', operations: link(1, 'QA Grower'), billing_entity: link(1) }],
  817295: [{ id: 1, name: 'QA Grower' }],
  817297: [{ id: 1, name: 'QA Billing' }],
  817298: [{ id: 1, name: 'QA Field', billing_entity: link(1), acres: 40 }],
  817299: [
    { id: 11, serial_number: '400001', brand: option('CropX'), status: option('Installed'), notes: 'Keep this history', year_new: year - 1, billing_entity: link(1) },
    { id: 12, serial_number: '400002', brand: option('CropX'), status: option('In Stock'), year_new: year },
    { id: 13, serial_number: '', brand: option('CropX'), status: option('On Order'), year_new: year },
  ],
  817300: [{ id: 101, season: year, field: link(1), crop: option('Corn') }, { id: 100, season: year - 1, field: link(1), crop: option('Corn') }],
  819350: [{ id: 201, probe: link(11, '400001'), field_season: link(101), probe_status: option('Installed') }, { id: 200, probe: link(11, '400001'), field_season: link(100), probe_status: option('Removed') }],
  827222: [{ id: 610, item_name: 'QA Antennas', category: option('Antennas'), quantity: 12 }],
  831050: [{ id: 710, station_name: 'QA Weather', model: 'CropX Strato', status: option('Active'), connectivity_type: option('Cellular'), billing_entity: link(1), price_paid: '100' }],
  934076: [{ id: 501, rack: '1A', rack_slot: 1, probe: link(11, '400001') }, { id: 502, rack: '1A', rack_slot: 2, probe: [] }, { id: 503, rack: '1B', rack_slot: 1, probe: link(12, '400002') }, { id: 504, rack: '1B', rack_slot: 2, probe: [] }],
};
let nextId = 900;
const originalFetch = global.fetch;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname !== 'api.baserow.io') {
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return originalFetch(input, init);
    throw new Error(`External fetch blocked in equipment tests: ${url.hostname}`);
  }
  const method = (init.method || input.method || 'GET').toUpperCase();
  if (url.pathname.includes('/fields/table/')) return json([]);
  const match = url.pathname.match(/\/rows\/table\/(\d+)\/(\d+)?/);
  if (!match) return json({ error: 'Unsupported fixture endpoint' }, 400);
  const rows = tables[Number(match[1])] ?? (tables[Number(match[1])] = []);
  const id = Number(match[2]);
  if (method === 'GET') {
    if (id) return json(rows.find(row => row.id === id) || {});
    const search = url.searchParams.get('search')?.toLowerCase();
    const results = search ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(search)) : rows;
    return json({ count: results.length, next: null, previous: null, results });
  }
  if (!['POST', 'PATCH'].includes(method)) return json({ error: 'Destructive method blocked' }, 405);
  const body = JSON.parse(init.body || '{}');
  for (const key of ['status', 'brand', 'probe_status']) if (typeof body[key] === 'string') body[key] = option(body[key]);
  if ('probe' in body) {
    const probeId = Array.isArray(body.probe) ? body.probe[0] : body.probe;
    body.probe = probeId ? link(probeId, tables[817299].find(row => row.id === probeId)?.serial_number) : [];
  }
  if (method === 'POST') { const row = { ...body, id: nextId++ }; rows.push(row); return json(row, 201); }
  const row = rows.find(row => row.id === id);
  if (!row) return json({ error: 'Not found' }, 404);
  Object.assign(row, body);
  return json(row);
};
