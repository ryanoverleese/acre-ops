const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Table IDs from your Baserow database
export const TABLE_IDS = {
  contacts: 817294,
  operations: 817295,
  operation_contacts: 817296,
  billing_entities: 817297,
  fields: 817298,
  probes: 817299,
  field_seasons: 817300,
  repairs: 817301,
  water_recs: 817302,
  invoices: 817303,
  invoice_lines: 817304,
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
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Generic get all rows for a table
export async function getRows<T>(tableName: TableName, options?: FetchOptions): Promise<T[]> {
  const tableId = TABLE_IDS[tableName];
  const response = await baserowFetch<T>(tableId, options);
  return response.results;
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
  });

  if (!response.ok) {
    throw new Error(`Baserow API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Specific typed fetchers for each table
export interface Contact {
  id: number;
  Name: string;
  Phone?: string;
  Email?: string;
  Role?: string;
}

export interface Operation {
  id: number;
  Name: string;
  Notes?: string;
}

export interface BillingEntity {
  id: number;
  Name: string;
  Operation?: { id: number; value: string }[];
  'Invoice Contact'?: { id: number; value: string }[];
}

export interface Field {
  id: number;
  Name: string;
  Operation?: { id: number; value: string }[];
  Acres?: number;
  Crop?: string;
  Latitude?: number;
  Longitude?: number;
  Status?: string;
}

export interface Probe {
  id: number;
  'Serial Number'?: string;
  Brand?: string;
  Model?: string;
  Length?: string;
  Owner?: { id: number; value: string }[];
  'Rack Location'?: string;
  'Assigned Field'?: { id: number; value: string }[];
  Status?: string;
}

export interface FieldSeason {
  id: number;
  Field?: { id: number; value: string }[];
  Season?: string;
  Crop?: string;
  Probe?: { id: number; value: string }[];
  Status?: string;
}

export interface Repair {
  id: number;
  Probe?: { id: number; value: string }[];
  Field?: { id: number; value: string }[];
  Problem?: string;
  'Fix Applied'?: string;
  Status?: string;
  'Reported Date'?: string;
}

export interface WaterRec {
  id: number;
  Field?: { id: number; value: string }[];
  Date?: string;
  Recommendation?: string;
  'Water Day'?: string;
}

export interface Invoice {
  id: number;
  'Billing Entity'?: { id: number; value: string }[];
  Amount?: number;
  Status?: string;
  'Created Date'?: string;
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
