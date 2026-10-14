// Synthetic app-shape records for the isolated PostgreSQL browser tests.
// Data only: no environment changes, HTTP interception, or live connections.
module.exports = function createRemovalSeed(year = new Date().getFullYear()) {
  const option = value => ({ value });
  const link = (id, value = String(id)) => [{ id, value }];
  return {
    contacts: [{ id: 1, name: 'QA Contact', operations: link(1), billing_entity: link(1) }],
    operations: [{ id: 1, name: 'QA Grower' }],
    billing_entities: [{ id: 1, name: 'QA Billing' }],
    fields: [{ id: 1, name: 'QA Field', billing_entity: link(1) }],
    probes: [11, 12].map((id, i) => ({ id, serial_number: `40000${i + 1}`, brand: option('CropX'), status: option('Installed') })),
    field_seasons: [{ id: 101, season: year, field: link(1), crop: option('Corn'), planned_remover: option('Carter') }, { id: 100, season: year - 1, field: link(1) }],
    probe_assignments: [
      { id: 201, probe: link(11, '400001'), field_season: link(101), label: 'NE', probe_status: option('Installed'), install_date: `${year}-05-01`, planned_remover: 'Carter' },
      { id: 202, probe: link(12, '400002'), field_season: link(101), label: 'SW', probe_status: option('Installed'), install_date: `${year}-05-01`, planned_remover: 'Ryan' },
      { id: 200, probe: link(11, '400001'), field_season: link(100), label: 'Historical', probe_status: option('Removed'), removal_date: `${year - 1}-10-01` },
    ],
  };
};
