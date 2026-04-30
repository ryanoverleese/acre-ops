/**
 * update-planting-data.mjs
 * Updates hybrid_variety and planting_date for matched field seasons in Baserow.
 * Run: BASEROW_TOKEN=your_token node scripts/update-planting-data.mjs
 *
 * Set DRYRUN=1 to preview without writing:
 *   DRYRUN=1 BASEROW_TOKEN=your_token node scripts/update-planting-data.mjs
 */

const TABLE_ID = 817300; // field_seasons
const TOKEN = process.env.BASEROW_TOKEN || 'PASTE_YOUR_TOKEN_HERE';
const DRYRUN = process.env.DRYRUN === '1';
const DELAY_MS = 400;

if (!TOKEN) {
  console.error('Missing BASEROW_TOKEN env var');
  process.exit(1);
}

// Matched from planting data → Baserow field_season IDs
// Fields with multiple sub-fields use the primary hybrid; planting_date uses earliest date
// Unmatched fields (not in Baserow export) are omitted
const UPDATES = [
  // Fishell & Fishell
  { id: 1321, field: 'Lost Creek',        hybrid: 'P1457WAM-Q',   planting_date: '2026-04-19' },
  { id: 1322, field: 'Boston North',      hybrid: 'P1457WAM-Q',   planting_date: '2026-04-20' },
  { id: 1324, field: 'The 80/Hedstrom',   hybrid: 'P1742Q',       planting_date: '2026-04-16' },
  { id: 1325, field: "Ernie's",           hybrid: 'P1170AM',      planting_date: '2026-04-16' },
  { id: 1356, field: "Emil's",            hybrid: 'P1457WAM',     planting_date: '2026-04-16' },
  { id: 1357, field: 'Palmblade',         hybrid: 'P1457WAM',     planting_date: '2026-04-16' }, // North & South of Canal, both P1457WAM
  { id: 1358, field: "Murray's 80",       hybrid: 'P1457WAM',     planting_date: '2026-04-13' }, // East of Creek; West had different hybrid (K113-01WTRIB) — review manually
  { id: 1367, field: "Gwen's 80",         hybrid: '1457WAM-Q',    planting_date: '2026-04-20' },
  { id: 1368, field: 'Home Big Pivot',    hybrid: '14920WPCE',    planting_date: '2026-04-13' }, // East/North field hybrid; West of House had 1408WAM — review manually

  // No confident Baserow match found for:
  //   Axels, Dahl's Home, Dahl's South 40, Galyn's North, Grove 80, Grove West,
  //   Home Little Pivot sub-fields, Kiker, LloyDeans, Pat Ryan's, Rost, Shermans,
  //   Swensen's, Wolcott's
  //
  // Kelly Rapp — Eckloffs, Larrys, T&L Pivot not found in Baserow export
];

async function patch(id, hybrid, planting_date) {
  const url = `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/${id}/?user_field_names=true`;
  const body = {};
  if (hybrid)        body['hybrid variety'] = hybrid;
  if (planting_date) body['planting_date']   = planting_date;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Token ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log(`${DRYRUN ? '[DRY RUN] ' : ''}Updating ${UPDATES.length} field seasons...\n`);

  for (const row of UPDATES) {
    const label = `ID ${row.id} — ${row.field}`;
    if (DRYRUN) {
      console.log(`  [dry] ${label}: hybrid="${row.hybrid}" planting_date="${row.planting_date}"`);
      continue;
    }

    try {
      await patch(row.id, row.hybrid, row.planting_date);
      console.log(`  ✓ ${label}`);
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log('\nDone.');
}

run();
