// Transitional facade: historical imports and DTOs, Supabase-only implementation.
import { getRows, getCachedRows } from './supabase/adapter';
import type { FetchOptions } from './supabase/adapter';
export { getRows, getCachedRows, getRow, createRow, updateRow, deleteRow, bustTableCache, addSpaceVariants,
  getTableFieldOptions, getTableFieldOptionsWithMeta, getAllSelectOptions, getCachedAllSelectOptions, getAllSelectOptionsWithMeta } from './supabase/adapter';
export type { SelectOption, TableSelectOptions, TableSelectOptionsWithMeta, FetchOptions } from './supabase/adapter';
export type FieldOptionsMeta = import('./supabase/adapter').TableSelectOptionsWithMeta[string];
export type BaserowFilter = import('./supabase/adapter').Filter;

// Legacy source inventory identifiers ONLY; no runtime transport uses these numbers.
export const TABLE_IDS = {
  contacts: 817294,
  operations: 817295,
  billing_entities: 817297,
  fields: 817298,
  probes: 817299,
  field_seasons: 817300,
  repairs: 817301,
  water_recs: 817302,
  invoices: 817303,
  invoice_lines: 817304,
  probe_assignments: 819350,
  products_services: 826849,
  inventory: 827222,
  users: 828606,
  weather_stations: 831050,
  orders: 831072,
  order_items: 831073,
  notifications: 854433,
  documents: 861653,
  probe_rack: 934076,
  installers: 939826,
  mileage_logs: 982999,
} as const;

export type TableName = keyof typeof TABLE_IDS;

// Specific typed fetchers for each table
export interface Contact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  address_lat?: number;
  address_lng?: number;
  customer_type?: { id: number; value: string }[];
  notes?: string;
  operations?: { id: number; value: string }[];
  billing_entity?: { id: number; value: string }[];
  is_main_contact?: { id: number; value: string };
}

export interface Operation {
  id: number;
  name: string;
  notes?: string;
  approval_token?: string;
}

export interface BillingEntity {
  id: number;
  name: string;
  self_install?: boolean;
}

export interface Field {
  id: number;
  name: string;
  billing_entity?: { id: number; value: string }[];
  acres?: number;
  pivot_acres?: number;
  lat?: number;
  lng?: number;
  water_source?: { id: number; value: string };
  fuel_source?: { id: number; value: string };
  notes?: string;
  elevation?: number | { id: number; value: string };
  soil_type?: string | { id: number; value: string };
  placement_notes?: string;
  irrigation_type?: { id: number; value: string };
  row_direction?: { id: number; value: string };
  drip_tubing_direction?: { id: number; value: string };
  drip_tubing_spacing?: number;
  drip_emitter_spacing?: number;
  drip_zones?: number;
  drip_gpm?: number;
  drip_depth?: number;
  field_directions?: string;
  install_directions?: string;
  nrcs_field?: boolean;
  ai_ufid?: string;
  plss_township?: number;
  plss_range?: number;
  plss_section?: number;
  plss_description?: string;
}

export interface Probe {
  id: number;
  serial_number?: string;
  brand?: { id: number; value: string };
  billing_entity?: { id: number; value: string }[];
  contact?: { id: number; value: string }[];
  owner_operation?: { id: number; value: string }[];
  year_new?: number;
  status?: { id: number; value: string };
  rack?: { id: number; value: string };
  rack_slot?: number;
  // Permanent probe-level notes (not season-scoped). Removals also shows these
  // after seasonal assignment notes — there is no separate notes_2026 field.
  notes?: string;
  damages_repairs?: string;
  date_created?: string;
  trade_year?: { id: number; value: string };
  is_trade?: boolean;
}

export interface FieldSeason {
  id: number;
  field?: { id: number; value: string }[];
  season?: number;
  crop?: { id: number; value: string };
  crop_confirmed?: boolean;
  service_type?: { id: number; value: string }[];
  side_dress?: { id: number; value: string };
  logger_id?: string;
  early_removal?: { id: number; value: string };
  early_install?: { id: number; value: string };
  hybrid_variety?: string;
  ready_to_remove?: { id: number; value: string };
  planting_date?: string;
  // Install planning
  route_order?: string;
  planned_installer?: { id: number; value: string };
  planned_remover?: { id: number; value: string };
  removal_priority?: { id: number; value: string };
  ready_to_install?: boolean;
  install_group?: number | null;
  // Legacy alias — Baserow field_seasons has field_note / removal_notes, not notes.
  notes?: string;
  // All probe data (probe, probe_status, antenna_type, battery_type,
  // installer, install_*, cropx_telemetry_id, signal_strength) lives on probe_assignments table.
  // These fields were removed from field_seasons in Baserow.
  // Other
  removal_date?: string;
  removal_notes?: string;
  approval_status?: { id: number; value: string };
  approval_notes?: string;
  approval_date?: string;
  approval_sent?: string;
  // Free-form note Ryan keeps per field for the whole season (resets next season,
  // since each season is a new field_season row). Shown on the Water Recs page.
  field_note?: string;
}

export interface Repair {
  id: number;
  field_season?: { id: number; value: string }[];
  probe_assignment?: { id: number; value: string }[];
  reported_at?: string;
  problem?: string;
  fix?: string;
  repaired_at?: string;
  notified_customer?: boolean;
  probe_replaced?: boolean;
  new_probe_serial?: string;
  watch_list?: boolean;
}

export interface ProbeAssignment {
  id: number;
  field_season?: { id: number; value: string }[];
  probe?: { id: number; value: string }[];
  probe_number?: number; // 1, 2, 3, etc.
  label?: string; // e.g. "NE", "SW" for multi-probe fields
  antenna_type?: { id: number; value: string };
  battery_type?: { id: number; value: string };
  // Placement data (defaulted from field, can be overridden)
  placement_lat?: number;
  placement_lng?: number;
  elevation?: number | string;
  soil_type?: string;
  // Seasonal (per assignment / year) pull/placement guidance — Fields UI "Notes".
  placement_notes?: string;
  // Install data
  probe_status?: { id: number; value: string };
  installer?: string;
  install_date?: string;
  removal_date?: string;
  removal_notes?: string;
  removed_by?: string;
  removal_photo?: { url: string; name: string }[];
  install_lat?: number;
  install_lng?: number;
  install_photo_field_end?: { url: string; name: string }[];
  install_photo_extra?: { url: string; name: string }[];
  install_notes?: string;
  grower_notified?: string;
  pickup_access?: boolean | string | null;
  cropx_telemetry_id?: string;
  signal_strength?: string;
  // Approval data
  approval_status?: { id: number; value: string };
  approval_notes?: string;
  approval_date?: string;
  approval_sent?: string;
}

export interface WaterRec {
  id: number;
  field_season?: { id: number; value: string }[];
  date?: string;
  recommendation?: string;
  suggested_water_day?: string;
}

export interface Invoice {
  id: number;
  billing_entity?: { id: number; value: string }[];
  season?: number;
  amount?: number;
  status?: { id: number; value: string };
  sent_at?: string;
  deposit_at?: string;
  paid_at?: string;
  notes?: string;
  check_number?: number;
  actual_billed_amount?: number;
  invoice_number?: number;
  matched_in_qb?: boolean;
}

export interface InvoiceLine {
  id: number;
  invoice?: { id: number; value: string }[];
  field_season?: { id: number; value: string }[];
  service_type?: string;
  rate?: number;
  quantity?: number;
}

export interface Installer {
  id: number;
  name?: string;
  pinSet?: boolean;
}

export interface ProbeRackSlot {
  id: number;
  rack: string;
  rack_slot: number;
  probe?: { id: number; value: string }[];
}

export interface ProductService {
  id: number;
  name?: string;
  service_type?: string;
  rate?: number;
  dealer_fee?: number;
  description?: string;
  category?: { id: number; value: string };
  unit?: { id: number; value: string };
  active?: boolean;
  status?: { id: number; value: string };
}

// Convenience functions for each table
export const getContacts = (options?: FetchOptions) => getRows<Contact>('contacts', options);
export const getOperations = (options?: FetchOptions) => getRows<Operation>('operations', options);
export const getBillingEntities = (options?: FetchOptions) => getRows<BillingEntity>('billing_entities', options);
export const getFields = (options?: FetchOptions) => getRows<Field>('fields', options);
export const getProbes = (options?: FetchOptions) => getRows<Probe>('probes', options);
export const getFieldSeasons = (options?: FetchOptions) => getRows<FieldSeason>('field_seasons', options);
export const getRepairs = (options?: FetchOptions) => getRows<Repair>('repairs', options);
export const getWaterRecs = (options?: FetchOptions) => getRows<WaterRec>('water_recs', options);
export const getInvoices = (options?: FetchOptions) => getRows<Invoice>('invoices', options);
export const getInvoiceLines = (options?: FetchOptions) => getRows<InvoiceLine>('invoice_lines', options);
export const getProbeAssignments = (options?: FetchOptions) => getRows<ProbeAssignment>('probe_assignments', options);
export const getProductsServices = (options?: FetchOptions) => getRows<ProductService>('products_services', options);

// Cached convenience getters — use these in server components/pages.
// Writes through updateRow/createRow/bustTableCache invalidate the table's
// tag immediately, so the TTLs below only bound staleness for edits made
// directly in the Baserow UI. Volatile tables get short TTLs; slow-changing
// reference tables (contacts, operations, billing) get longer ones.
export const getCachedContacts = () => getCachedRows<Contact>('contacts', undefined, 600);
export const getCachedOperations = () => getCachedRows<Operation>('operations', undefined, 600);
export const getCachedBillingEntities = () => getCachedRows<BillingEntity>('billing_entities', undefined, 600);
export const getCachedFields = () => getCachedRows<Field>('fields', undefined, 120);
export const getCachedProbes = () => getCachedRows<Probe>('probes', undefined, 120);
export const getCachedFieldSeasons = () => getCachedRows<FieldSeason>('field_seasons', undefined, 120);
export const getCachedRepairs = () => getCachedRows<Repair>('repairs', undefined, 120);
export const getCachedProbeAssignments = () => getCachedRows<ProbeAssignment>('probe_assignments', undefined, 120);

export interface InventoryItem {
  id: number;
  item_name?: string;
  category?: { id: number; value: string };
  quantity?: number;
}

export const getInventory = (options?: FetchOptions) => getRows<InventoryItem>('inventory', options);

export interface WeatherStation {
  id: number;
  station_name?: string;
  model?: string;
  billing_entity?: { id: number; value: string }[];
  install_lat?: number;
  install_lng?: number;
  install_date?: string;
  connectivity_type?: { id: number; value: string };
  status?: { id: number; value: string };
  price_paid?: string;
  notes?: string;
}

export const getWeatherStations = (options?: FetchOptions) => getRows<WeatherStation>('weather_stations', options);

export interface Order {
  id: number;
  billing_entity?: { id: number; value: string }[];
  order_date?: string;
  status?: { id: number; value: string };
  notes?: string;
  total?: string;
  quote_valid_days?: number;
}

export interface OrderItem {
  id: number;
  item_id?: number;
  order_link?: { id: number; value: string }[];
  product?: { id: number; value: string }[];
  quantity?: number;
  unit_price?: string;
  notes?: string;
}

export const getOrders = (options?: FetchOptions) => getRows<Order>('orders', options);
export const getOrderItems = (options?: FetchOptions) => getRows<OrderItem>('order_items', options);

export interface User {
  id: number;
  email: string;
  password_hash?: string;
  name: string;
  role: { id: number; value: string };
  active: boolean;
  created_at?: string;
  last_login?: string;
}

export const getUsers = (options?: FetchOptions) => getRows<User>('users', options);

export interface Notification {
  id: number;
  operation?: { id: number; value: string }[];
  field?: { id: number; value: string }[];
  changed_field?: string;
  new_value?: string;
  page_type?: { id: number; value: string };
  read?: boolean;
  created_on?: string;
}

export const getNotifications = (options?: FetchOptions) => getRows<Notification>('notifications', options);

export interface Document {
  id: number;
  name?: string;
  file?: { url: string; name: string; size: number; mime_type: string; is_image: boolean }[];
  description?: string;
  uploaded_by?: string;
  uploaded_at?: string;
}

export async function getDocuments(): Promise<Document[]> {
  return getRows<Document>('documents', { orderBy: '-uploaded_at' });
}

