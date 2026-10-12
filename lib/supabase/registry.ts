import inventory from './registry.json';

// Generated from the two reviewed migrations, not from a live database.
export interface Column { name: string; type: string; required: boolean; identity: boolean; target?: string }
export interface Table { columns: Column[]; read: string }
export interface Join { name: string; source: string; field: string; left: string; right: string; target: string }
export const registry = inventory as { tables: Record<string, Table>; catalogs: {name: string; source: string; field: string}[]; joins: Join[]; sourceNames: string[] };
export const PROJECT_REF = 'junawlttpyztjlnbmvcb';
export const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
export const BUCKET = 'baserow-import';
export const DATA_VERSION = 'supabase-native-v1';
export const DATA_TAG = `acre-${DATA_VERSION}`;
export const labels: Record<string, string> = {
  products_services: 'service_type', inventory: 'item_name', users: 'email', probes: 'serial_number',
  field_seasons: 'record_name', probe_assignments: 'record_name', water_recs: 'record_name', repairs: 'record_name',
  invoices: 'record_name', invoice_lines: 'record_name', orders: 'order_id', order_items: 'item_id',
  weather_stations: 'station_name', probe_rack: 'rack', mileage_logs: 'installer', notifications: 'field_name',
};
export function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid identifier');
  return `"${value}"`;
}
export function sourceTable(value: string): Table {
  if (!registry.sourceNames.includes(value)) throw new DataError('Unknown table', 400);
  return registry.tables[value];
}
export class DataError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new DataError('A positive record ID is required');
  return id;
}
export function fieldName(table: string, column: Column): string {
  if (table === 'notifications' && column.name === 'changed_field') return 'field';
  if (table === 'notifications' && column.name === 'field_name') return 'changed_field';
  return column.target && column.name.endsWith('_id') ? column.name.slice(0, -3) : column.name;
}
