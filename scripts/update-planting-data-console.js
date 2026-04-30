// Paste this into the browser console on the acre-ops site
// It calls your own API routes — no token needed

const UPDATES = [
  // --- Corn ---
  { id: 1321, field: 'Lost Creek',        hybrid: 'P1457WAM-Q',  planting_date: '2026-04-19' },
  { id: 1322, field: 'Boston North',      hybrid: 'P1457WAM-Q',  planting_date: '2026-04-20' },
  { id: 1324, field: 'The 80/Hedstrom',   hybrid: 'P1742Q',      planting_date: '2026-04-16' },
  { id: 1325, field: "Ernie's",           hybrid: 'P1170AM',     planting_date: '2026-04-16' },
  { id: 1356, field: "Emil's",            hybrid: 'P1457WAM',    planting_date: '2026-04-16' },
  { id: 1357, field: 'Palmblade',         hybrid: 'P1457WAM',    planting_date: '2026-04-16' },
  { id: 1358, field: "Murray's 80",       hybrid: 'P1457WAM',    planting_date: '2026-04-13' },
  { id: 1367, field: "Gwen's 80",         hybrid: 'P1457WAM-Q',  planting_date: '2026-04-20' },
  { id: 1368, field: 'Home Big Pivot',    hybrid: 'P14920WPCE',  planting_date: '2026-04-13' },
  { id: 1370, field: 'Home Little Pivot', hybrid: 'P1408WAM',    planting_date: '2026-04-13' },

  // --- Soybeans ---
  { id: 1354, field: "Murray's Quarter",  hybrid: 'P23Z58E',     planting_date: '2026-04-24' },
  { id: 1355, field: 'Dunlay Quarter',    hybrid: 'P23Z58E',     planting_date: '2026-04-23' },
  { id: 1359, field: 'Dahl West',         hybrid: 'P28Z30E',     planting_date: '2026-04-24' },
  { id: 1360, field: 'Dahl Substation',   hybrid: 'P23Z58E',     planting_date: '2026-04-24' }, // Dahl's East Pivot — verify name match
  { id: 1363, field: "Bill's",            hybrid: 'P29Z61E',     planting_date: '2026-04-22' },
  { id: 1364, field: "Daryl's Quarter",   hybrid: 'P29Z61E',     planting_date: '2026-04-21' },
  { id: 1366, field: "Everett's Quarter", hybrid: 'P33Z17E',     planting_date: '2026-04-21' },
  { id: 1369, field: 'Home East',         hybrid: 'P29Z61E',     planting_date: '2026-04-22' },

  // Not found in machine data: Ronnie B's (1361), Swensen's (1323)
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  for (const row of UPDATES) {
    const res = await fetch(`/api/field-seasons/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hybrid_variety: row.hybrid, planting_date: row.planting_date }),
    });
    console.log(res.ok ? `✓ ${row.field}` : `✗ ${row.field} (${res.status})`);
    await sleep(400);
  }
  console.log('Done.');
})();
