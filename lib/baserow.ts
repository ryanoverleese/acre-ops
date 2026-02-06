const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
// JWT auth for schema operations (field modifications).
// Database tokens can CRUD rows but CANNOT modify field definitions (returns 401).
// Set BASEROW_EMAIL + BASEROW_PASSWORD to enable JWT-based field schema changes.
const BASEROW_EMAIL = process.env.BASEROW_EMAIL;
const BASEROW_PASSWORD = process.env.BASEROW_PASSWORD;

/**
 * Get a JWT token for Baserow schema operations (adding select options, etc).
 * Database tokens can only CRUD rows — field definition changes need JWT auth.
 * Returns null if credentials aren't configured or auth fails.
 */
export async function getBaserowJwt(): Promise<string | null> {
  const hasEmail = !!BASEROW_EMAIL;
  const hasPassword = !!BASEROW_PASSWORD;
  console.log(`getBaserowJwt: BASEROW_EMAIL=${hasEmail ? `set (${BASEROW_EMAIL?.substring(0, 3)}...)` : 'MISSING'}, BASEROW_PASSWORD=${hasPassword ? 'set' : 'MISSING'}`);

  if (!BASEROW_EMAIL || !BASEROW_PASSWORD) {
    console.error('getBaserowJwt: BASEROW_EMAIL and BASEROW_PASSWORD are required for field schema changes');
    return null;
  }

  try {
    const authUrl = 'https://api.baserow.io/api/user/token-auth/';
    console.log(`getBaserowJwt: requesting JWT from ${authUrl}`);

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: BASEROW_EMAIL, password: BASEROW_PASSWORD }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`getBaserowJwt: auth failed: ${response.status} ${response.statusText}`, errorBody);
      return null;
    }

    const data = await response.json();
    const token = data.token || data.access_token || null;
    console.log(`getBaserowJwt: success, token=${token ? `${token.substring(0, 10)}...` : 'NULL'}, response keys: ${Object.keys(data).join(',')}`);
    return token;
  } catch (error) {
    console.error('getBaserowJwt: unexpected error:', error);
    return null;
  }
}

// Table IDs from your Baserow database
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
  service_rates: 826849,
  inventory: 827222,
  users: 828606,
} as const;

export type TableName = keyof typeof TABLE_IDS;

interface BaserowResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface FetchOptions {
  page?: number;
  size?: number;
  search?: string;
  orderBy?: string;
  filters?: Record<string, unknown>;
}

// Normalize Baserow field names: replace spaces with underscores and lowercase.
// This ensures our TypeScript interfaces (which use snake_case) always match,
// regardless of whether Baserow fields use spaces or underscores.
function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.replace(/ /g, '_');
    normalized[normalizedKey] = value;
  }
  return normalized;
}

// Retry helper for transient API errors (rate limiting, network issues)
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }
    // Retry on 429 (rate limit) or 5xx (server error)
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`Baserow API ${response.status} for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      return response;
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: exhausted retries');
}

async function baserowFetch<T>(
  tableId: number,
  options: FetchOptions = {}
): Promise<BaserowResponse<T>> {
  const { page = 1, size = 100, search, orderBy } = options;

  const params = new URLSearchParams({
    user_field_names: 'true',
    page: page.toString(),
    size: size.toString(),
  });

  if (search) {
    params.append('search', search);
  }

  if (orderBy) {
    params.append('order_by', orderBy);
  }

  const url = `${BASEROW_API_URL}/${tableId}/?${params.toString()}`;

  const response = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Normalize field names in results: spaces → underscores
  if (data.results) {
    data.results = data.results.map((row: Record<string, unknown>) => normalizeKeys(row));
  }

  return data;
}

// Generic get all rows for a table (fetches ALL pages)
export async function getRows<T>(tableName: TableName, options?: FetchOptions): Promise<T[]> {
  const tableId = TABLE_IDS[tableName];
  const allResults: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await baserowFetch<T>(tableId, { ...options, page, size: 200 });
    allResults.push(...response.results);

    // Check if there are more pages
    hasMore = response.next !== null;
    page++;
  }

  return allResults;
}

// Get a single row by ID
export async function getRow<T>(tableName: TableName, rowId: number): Promise<T> {
  const tableId = TABLE_IDS[tableName];
  const url = `${BASEROW_API_URL}/${tableId}/${rowId}/?user_field_names=true`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return normalizeKeys(data) as T;
}

// Specific typed fetchers for each table
export interface Contact {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  address_lat?: number;
  address_lng?: number;
  customer_type?: { id: number; value: string };
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
  nrcs_field?: boolean;
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
  notes?: string;
  damages_repairs?: string;
  date_created?: string;
}

export interface FieldSeason {
  id: number;
  field?: { id: number; value: string }[];
  season?: number;
  crop?: { id: number; value: string };
  crop_confirmed?: boolean;
  service_type?: { id: number; value: string }[];
  antenna_type?: { id: number; value: string };
  battery_type?: { id: number; value: string };
  side_dress?: { id: number; value: string };
  logger_id?: string;
  early_removal?: { id: number; value: string };
  hybrid_variety?: string;
  ready_to_remove?: { id: number; value: string };
  planting_date?: string;
  // Install planning
  route_order?: number;
  planned_installer?: { id: number; value: string };
  ready_to_install?: boolean;
  // Probe 1
  probe?: { id: number; value: string }[];
  probe_status?: { id: number; value: string };
  installer?: string;
  install_date?: string;
  install_lat?: number;
  install_lng?: number;
  install_photo_field_end_url?: { url: string; name: string }[];
  install_photo_extra_url?: { url: string; name: string }[];
  install_notes?: string;
  cropx_telemetry_id?: string;
  signal_strength?: string;
  // Probe 2+ data lives in the probe_assignments table, not here
  // Other
  removal_date?: string;
  removal_notes?: string;
  approval_status?: { id: number; value: string };
  approval_notes?: string;
  approval_date?: string;
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
}

export interface ProbeAssignment {
  id: number;
  field_season?: { id: number; value: string }[];
  probe?: { id: number; value: string }[];
  probe_number?: number; // 1, 2, 3, etc.
  antenna_type?: { id: number; value: string };
  battery_type?: { id: number; value: string };
  // Placement data (defaulted from field, can be overridden)
  placement_lat?: number;
  placement_lng?: number;
  elevation?: number | string;
  soil_type?: string;
  placement_notes?: string;
  // Install data
  probe_status?: { id: number; value: string };
  installer?: string;
  install_date?: string;
  install_lat?: number;
  install_lng?: number;
  install_photo_field_end_url?: { url: string; name: string }[];
  install_photo_extra_url?: { url: string; name: string }[];
  install_notes?: string;
  cropx_telemetry_id?: string;
  signal_strength?: string;
  // Approval data
  approval_status?: { id: number; value: string };
  approval_notes?: string;
  approval_date?: string;
}

export interface WaterRec {
  id: number;
  field_season?: { id: number; value: string }[];
  date?: string;
  recommendation?: string;
  suggested_water_day?: { id: number; value: string };
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
}

export interface InvoiceLine {
  id: number;
  invoice?: { id: number; value: string }[];
  field_season?: { id: number; value: string }[];
  service_type?: string;
  rate?: number;
}

export interface ServiceRate {
  id: number;
  service_type?: string;
  rate?: number;
  dealer_fee?: number;
  description?: string;
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
export const getServiceRates = (options?: FetchOptions) => getRows<ServiceRate>('service_rates', options);

export interface InventoryItem {
  id: number;
  item_name?: string;
  category?: { id: number; value: string };
  quantity?: number;
}

export const getInventory = (options?: FetchOptions) => getRows<InventoryItem>('inventory', options);

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: { id: number; value: string };
  active: boolean;
  created_at?: string;
  last_login?: string;
}

export const getUsers = (options?: FetchOptions) => getRows<User>('users', options);

// ────────────────────────────────────────────────────────────────────────────
// Field metadata: fetch single_select options from Baserow table schema
// ────────────────────────────────────────────────────────────────────────────

export interface SelectOption {
  id: number;
  value: string;
  color: string;
}

export interface TableSelectOptions {
  [fieldName: string]: SelectOption[];
}

export interface FieldOptionsMeta {
  fieldId: number;
  options: SelectOption[];
}

export interface TableSelectOptionsWithMeta {
  [fieldName: string]: FieldOptionsMeta;
}

/**
 * Fetch all single_select field options for a given table.
 * Uses Baserow's field metadata API: GET /api/database/fields/table/{table_id}/
 * Returns a map of normalized_field_name → select_options[]
 */
export async function getTableFieldOptions(tableName: TableName): Promise<TableSelectOptions> {
  const tableId = TABLE_IDS[tableName];
  const url = `https://api.baserow.io/api/database/fields/table/${tableId}/`;

  const response = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`Failed to fetch field options for ${tableName}:`, response.status);
    return {};
  }

  const fields: Array<{
    id: number;
    name: string;
    type: string;
    select_options?: SelectOption[];
  }> = await response.json();

  const result: TableSelectOptions = {};
  for (const field of fields) {
    if (field.type === 'single_select' && field.select_options) {
      const normalizedName = field.name.replace(/ /g, '_');
      result[normalizedName] = field.select_options;
    }
  }

  return result;
}

/**
 * Fetch select options with Baserow field IDs (needed for PATCH updates).
 * Returns a map of normalized_field_name → { fieldId, options[] }
 */
export async function getTableFieldOptionsWithMeta(tableName: TableName): Promise<TableSelectOptionsWithMeta> {
  const tableId = TABLE_IDS[tableName];
  const url = `https://api.baserow.io/api/database/fields/table/${tableId}/`;

  const response = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error(`Failed to fetch field options for ${tableName}:`, response.status);
    return {};
  }

  const fields: Array<{
    id: number;
    name: string;
    type: string;
    select_options?: SelectOption[];
  }> = await response.json();

  const result: TableSelectOptionsWithMeta = {};
  for (const field of fields) {
    if (field.type === 'single_select' && field.select_options) {
      const normalizedName = field.name.replace(/ /g, '_');
      result[normalizedName] = { fieldId: field.id, options: field.select_options };
    }
  }

  return result;
}

/**
 * Fetch select options for multiple tables at once.
 * Returns { tableName: { fieldName: SelectOption[] } }
 */
export async function getAllSelectOptions(tableNames: TableName[]): Promise<Record<string, TableSelectOptions>> {
  const results = await Promise.all(
    tableNames.map(async (name) => {
      const options = await getTableFieldOptions(name);
      return [name, options] as const;
    })
  );
  return Object.fromEntries(results);
}

/**
 * Fetch select options with field IDs for multiple tables.
 * Returns { tableName: { fieldName: { fieldId, options[] } } }
 */
export async function getAllSelectOptionsWithMeta(tableNames: TableName[]): Promise<Record<string, TableSelectOptionsWithMeta>> {
  const results = await Promise.all(
    tableNames.map(async (name) => {
      const options = await getTableFieldOptionsWithMeta(name);
      return [name, options] as const;
    })
  );
  return Object.fromEntries(results);
}

