const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

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

  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 60 }, // Cache for 60 seconds, then refresh in background
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
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
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
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
}

export interface Probe {
  id: number;
  serial_number?: string;
  brand?: { id: number; value: string };
  billing_entity?: { id: number; value: string }[];
  contact?: { id: number; value: string }[];
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
  service_type?: { id: number; value: string };
  antenna_type?: { id: number; value: string };
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
  // Probe 2
  probe_2?: { id: number; value: string }[];
  probe_2_status?: { id: number; value: string };
  probe_2_installer?: string;
  probe_2_install_date?: string;
  probe_2_install_lat?: number;
  probe_2_install_lng?: number;
  probe_2_install_photo_field_end_url?: { url: string; name: string }[];
  probe_2_install_photo_extra_url?: { url: string; name: string }[];
  probe_2_install_notes?: string;
  probe_2_cropx_telemetry_id?: string;
  probe_2_signal_strength?: string;
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
}

export interface ProbeAssignment {
  id: number;
  field_season?: { id: number; value: string }[];
  probe?: { id: number; value: string }[];
  probe_number?: number; // 1, 2, 3, etc.
  antenna_type?: { id: number; value: string };
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
