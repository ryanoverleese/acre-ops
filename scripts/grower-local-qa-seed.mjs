#!/usr/bin/env node
/** Seed synthetic grower pilot data into local Postgres. Writes login only to ARTIFACT file. */
import fs from 'node:fs';
import { hash } from 'bcryptjs';
import pg from 'pg';

const OWNER_URL = process.env.DATABASE_URL;
const PIN = process.env.ACRE_LOCAL_GROWER_PIN || String(Math.floor(100000 + Math.random() * 900000));
const ARTIFACT = process.env.ARTIFACT_LOGIN_FILE || '/opt/cursor/artifacts/GROWER_PILOT_TEST_LOGIN.txt';
const YEAR = new Date().getUTCFullYear();

if (!OWNER_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: OWNER_URL, ssl: false });
await client.connect();

async function q(sql, params = []) {
  return (await client.query(sql, params)).rows;
}

await q(`INSERT INTO contact_customer_type_options (value)
  SELECT v FROM unnest(ARRAY['Current Customer','Past Customer']) AS v
  WHERE NOT EXISTS (SELECT 1 FROM contact_customer_type_options o WHERE o.value = v)`);
await q(`INSERT INTO assignment_probe_status_options (value)
  SELECT v FROM unnest(ARRAY['Installed','Assigned','Removed']) AS v
  WHERE NOT EXISTS (SELECT 1 FROM assignment_probe_status_options o WHERE o.value = v)`);

const pinHash = await hash(PIN, 12);
const [op] = await q(
  `INSERT INTO operations (name, grower_pin) VALUES ($1, $2) RETURNING id`,
  ['QA Pilot Farm', pinHash],
);
const [be] = await q(`INSERT INTO billing_entities (name) VALUES ('QA Billing') RETURNING id`);
const [contact] = await q(
  `INSERT INTO contacts (name, email) VALUES ('QA Contact', 'qa-pilot@example.invalid') RETURNING id`,
);
await q(`INSERT INTO contact_operations (contact_id, operation_id) VALUES ($1, $2)`, [contact.id, op.id]);
await q(`INSERT INTO contact_billing_entities (contact_id, billing_entity_id) VALUES ($1, $2)`, [contact.id, be.id]);
await q(
  `INSERT INTO contact_customer_types (contact_id, customer_type_id)
   SELECT $1, id FROM contact_customer_type_options WHERE value = 'Current Customer' LIMIT 1`,
  [contact.id],
);

const [field] = await q(
  `INSERT INTO fields (name, acres, lat, lng, elevation, soil_type)
   VALUES ('Home Pivot', 130.5, 40.47, -99.15, 2200, 'Holdrege (Hs)') RETURNING id`,
);
await q(`INSERT INTO field_billing_entities (field_id, billing_entity_id) VALUES ($1, $2)`, [field.id, be.id]);
const [season] = await q(
  `INSERT INTO field_seasons (field_id, season) VALUES ($1, $2) RETURNING id`,
  [field.id, YEAR],
);

const geom = {
  type: 'Polygon',
  coordinates: [[[-99.16, 40.46], [-99.16, 40.48], [-99.14, 40.48], [-99.14, 40.46], [-99.16, 40.46]]],
};
await q(
  `INSERT INTO field_boundaries
    (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at, edited_at)
   VALUES ($1, NULL, $2::jsonb, $3, 'EPSG:4326', 'lonlat', 'edited', now(), now())`,
  [field.id, JSON.stringify(geom), 'ab'.repeat(32)],
);

const [probe] = await q(
  `INSERT INTO probes (serial_number, year_new) VALUES ('SN-QA-001', $1) RETURNING id`,
  [YEAR - 2],
);
const [status] = await q(`SELECT id FROM assignment_probe_status_options WHERE value = 'Installed' LIMIT 1`);
await q(
  `INSERT INTO probe_assignments
    (field_season_id, probe_id, probe_number, label, probe_status_id, install_date, install_lat, install_lng, elevation, soil_type)
   VALUES ($1,$2,1,'NE',$3,$4,40.471,-99.151,2200,'Holdrege (Hs)')`,
  [season.id, probe.id, status.id, `${YEAR}-04-01T12:00:00.000Z`],
);

const [probe2] = await q(
  `INSERT INTO probes (serial_number, year_new) VALUES ('SN-QA-PINLESS', $1) RETURNING id`,
  [YEAR],
);
const [assigned] = await q(`SELECT id FROM assignment_probe_status_options WHERE value = 'Assigned' LIMIT 1`);
await q(
  `INSERT INTO probe_assignments
    (field_season_id, probe_id, probe_number, label, probe_status_id, install_date)
   VALUES ($1,$2,2,'SW',$3,$4)`,
  [season.id, probe2.id, assigned.id, `${YEAR}-05-01T12:00:00.000Z`],
);

await q(
  `INSERT INTO water_recs (field_season_id, date, recommendation, suggested_water_day, report_type) VALUES
    ($1, $2, 'Hold water this week.', 'Wednesday', 'full'),
    ($1, $3, 'Move water day to Friday.', 'Friday', 'update'),
    ($1, $4, 'Hidden overview note', NULL, 'overview')`,
  [season.id, `${YEAR}-06-10`, `${YEAR}-06-12`, `${YEAR}-06-11`],
);

// Edge: current-season field with no boundary, no probes, no water recs.
// acres=0 mimics production rows that store zero instead of NULL.
const [bare] = await q(
  `INSERT INTO fields (name, acres, lat, lng, elevation, soil_type)
   VALUES ('Bare Field', 0, 40.5, -99.2, NULL, NULL) RETURNING id`,
);
await q(`INSERT INTO field_billing_entities (field_id, billing_entity_id) VALUES ($1, $2)`, [bare.id, be.id]);
await q(`INSERT INTO field_seasons (field_id, season) VALUES ($1, $2)`, [bare.id, YEAR]);

// Edge: field with probes missing year_new / elevation / coords; no water recs; no boundary.
const [sparse] = await q(
  `INSERT INTO fields (name, acres, lat, lng)
   VALUES ('Sparse North', 22.25, NULL, NULL) RETURNING id`,
);
await q(`INSERT INTO field_billing_entities (field_id, billing_entity_id) VALUES ($1, $2)`, [sparse.id, be.id]);
const [sparseSeason] = await q(
  `INSERT INTO field_seasons (field_id, season) VALUES ($1, $2) RETURNING id`,
  [sparse.id, YEAR],
);
const [probeNoYear] = await q(
  `INSERT INTO probes (serial_number, year_new) VALUES ('SN-QA-NOYEAR', NULL) RETURNING id`,
);
await q(
  `INSERT INTO probe_assignments
    (field_season_id, probe_id, probe_number, label, probe_status_id, install_date)
   VALUES ($1,$2,1,'NW',$3,$4)`,
  [sparseSeason.id, probeNoYear.id, assigned.id, `${YEAR}-03-15T12:00:00.000Z`],
);

await client.end();

fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
fs.writeFileSync(
  ARTIFACT,
  [
    'Grower pilot local QA login (synthetic — not production)',
    'URL: http://127.0.0.1:3010/grower/login',
    'Farm name: QA Pilot Farm',
    `PIN: ${PIN}`,
    'Expected fields: Home Pivot, Bare Field, Sparse North',
    `Probe with pin: SN-QA-001 → ${YEAR - (YEAR - 2) + 1} seasons (age = season - year_new + 1)`,
    'Probe without pin: SN-QA-PINLESS (listed, no map marker)',
    'Sparse North: SN-QA-NOYEAR age Not recorded (null year_new); no boundary/recs',
    'Bare Field: no boundary, probes, or water recs',
    'Water: full + update only (overview hidden)',
    `Season year: ${YEAR}`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(`Seeded operation ${op.id}; login written to ${ARTIFACT} (not printed).`);
