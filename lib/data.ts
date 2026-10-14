// Table-specific data helpers; implementation and cache settings are preserved.
import { getRows, getCachedRows } from './supabase/adapter';
import type {
  FetchOptions, Contact, Operation, BillingEntity, Field, Probe, FieldSeason, Repair,
  WaterRec, Invoice, InvoiceLine, ProbeAssignment, ProductService, InventoryItem,
  WeatherStation, Order, OrderItem, User, Notification, Document,
} from './types';

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

export const getInventory = (options?: FetchOptions) => getRows<InventoryItem>('inventory', options);

export const getWeatherStations = (options?: FetchOptions) => getRows<WeatherStation>('weather_stations', options);

export const getOrders = (options?: FetchOptions) => getRows<Order>('orders', options);
export const getOrderItems = (options?: FetchOptions) => getRows<OrderItem>('order_items', options);

export const getUsers = (options?: FetchOptions) => getRows<User>('users', options);

export const getNotifications = (options?: FetchOptions) => getRows<Notification>('notifications', options);

export async function getDocuments(): Promise<Document[]> {
  return getRows<Document>('documents', { orderBy: '-uploaded_at' });
}
