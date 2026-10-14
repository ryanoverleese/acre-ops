// Synthetic app-shape records for the isolated PostgreSQL browser tests.
// Data only: no environment changes, HTTP interception, or live connections.
module.exports = function createEquipmentSeed(year = new Date().getFullYear()) {
  const option = value => ({ value });
  const link = (id, value = String(id)) => [{ id, value }];
  return {
    contacts: [{ id: 1, name: 'QA Contact', operations: link(1, 'QA Grower'), billing_entity: link(1) }],
    operations: [{ id: 1, name: 'QA Grower' }],
    billing_entities: [{ id: 1, name: 'QA Billing' }],
    fields: [{ id: 1, name: 'QA Field', billing_entity: link(1), acres: 40 }],
    probes: [
      { id: 11, serial_number: '400001', brand: option('CropX'), status: option('Installed'), notes: 'Keep this history', year_new: year - 1, billing_entity: link(1) },
      { id: 12, serial_number: '400002', brand: option('CropX'), status: option('In Stock'), year_new: year },
      { id: 13, serial_number: '', brand: option('CropX'), status: option('On Order'), year_new: year },
    ],
    field_seasons: [{ id: 101, season: year, field: link(1), crop: option('Corn') }, { id: 100, season: year - 1, field: link(1), crop: option('Corn') }],
    probe_assignments: [{ id: 201, probe: link(11, '400001'), field_season: link(101), probe_status: option('Installed') }, { id: 200, probe: link(11, '400001'), field_season: link(100), probe_status: option('Removed') }],
    inventory: [{ id: 610, item_name: 'QA Antennas', category: option('Antennas'), quantity: 12 }],
    weather_stations: [{ id: 710, station_name: 'QA Weather', model: 'CropX Strato', status: option('Active'), connectivity_type: option('Cellular'), billing_entity: link(1), price_paid: '100' }],
    probe_rack: [{ id: 501, rack: '1A', rack_slot: 1, probe: link(11, '400001') }, { id: 502, rack: '1A', rack_slot: 2, probe: [] }, { id: 503, rack: '1B', rack_slot: 1, probe: link(12, '400002') }, { id: 504, rack: '1B', rack_slot: 2, probe: [] }],
  };
};
