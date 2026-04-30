import {
  getOperations,
  getContacts,
  getBillingEntities,
  getFields,
  getFieldSeasons,
  getProbes,
  getProbeAssignments,
  getRepairs,
  getOrders,
  getOrderItems,
  getInvoices,
  getInvoiceLines,
  getWaterRecs,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import MobileApp from './MobileApp';

export const dynamic = 'force-dynamic';

// ── Types exported to client ────────────────────────────────────

export interface MobileContact {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  role?: string;
}

export interface MobileOperation {
  id: number;
  name: string;
  initials: string;
  status: 'returning' | 'new' | 'still-to-go' | 'unknown';
  fieldCount: number;
  probeCount2026: number;
  probeCount2025: number;
  revenue2026: number;
  revenue2025: number;
  notes?: string;
  contacts: MobileContact[];
  billingEntityIds: number[];
  billingEntityNames: string[];
}

export interface MobileField {
  id: number;
  fieldSeasonId2026?: number;
  name: string;
  operationId?: number;
  operationName: string;
  billingEntityId?: number;
  acres: number;
  crop?: string;
  lat?: number;
  lng?: number;
  soilType?: string;
  fieldDirections?: string;
  notes?: string;
  probeCount: number;
  plantingDate?: string;
  plannedInstaller?: string;
}

export interface MobileProbe {
  id: number;
  serialNumber: string;
  status: string;
  operationId?: number;
  operationName?: string;
  fieldId?: number;
  fieldName?: string;
  fieldSeasonId?: number;
  model?: string;
  installedDate?: string;
  eta?: string;
  lat?: number;
  lng?: number;
  tradeFor?: string;
  notes?: string;
}

export interface MobileRepair {
  id: number;
  fieldSeasonId?: number;
  fieldId?: number;
  fieldName: string;
  operationName: string;
  reportedAt: string;
  problem: string;
  fix?: string;
  repairedAt?: string;
  notifiedCustomer: boolean;
  probeSerial?: string;
  probeReplaced?: boolean;
  newProbeSerial?: string;
  status: 'open' | 'resolved';
}

export interface MobileOrder {
  id: number;
  billingEntityId?: number;
  billingEntityName: string;
  operationName: string;
  orderDate: string;
  status: string;
  notes: string;
  quoteValidDays: number;
  items: Array<{
    id: number;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
}

export interface MobileInvoiceLine {
  id: number;
  fieldName: string;
  service: string;
  qty: number;
  rate: number;
  total: number;
}

export interface MobileInvoice {
  id: number;
  invoiceNumber?: number;
  billingEntityId?: number;
  billingEntityName: string;
  operationName: string;
  season?: number;
  calcAmount: number;
  billedAmount?: number;
  status: string;
  sentAt?: string;
  paidAt?: string;
  depositAt?: string;
  checkNumber?: number;
  matchedInQb: boolean;
  lineItems: MobileInvoiceLine[];
}

export interface MobileWaterRec {
  id: number;
  fieldSeasonId?: number;
  fieldId?: number;
  fieldName: string;
  operationId?: number;
  operationName: string;
  date?: string;
  recommendation: string;
  suggestedWaterDay?: string;
}

export interface InstallStatByOp {
  opId: number;
  opName: string;
  initials: string;
  installed: number;
  planned: number;
}

export interface MobileData {
  operations: MobileOperation[];
  fields: MobileField[];
  probes: MobileProbe[];
  repairs: MobileRepair[];
  orders: MobileOrder[];
  invoices: MobileInvoice[];
  waterRecs: MobileWaterRec[];
  installStats: {
    totalInstalled: number;
    totalPlanned: number;
    byOp: InstallStatByOp[];
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function asNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isFinite(n) ? n : 0;
}

const CURRENT_SEASON = 2026;
const PREV_SEASON = 2025;

// ── Main data loader ─────────────────────────────────────────────

async function loadMobileData(): Promise<MobileData> {
  const [
    rawOps,
    rawContacts,
    rawBEs,
    rawFields,
    rawFieldSeasons,
    rawProbes,
    rawProbeAssignments,
    rawRepairs,
    rawOrders,
    rawOrderItems,
    rawInvoices,
    rawInvoiceLines,
    rawWaterRecs,
  ] = await Promise.all([
    getOperations(),
    getContacts(),
    getBillingEntities(),
    getFields(),
    getFieldSeasons({ size: 200 }),
    getProbes({ size: 200 }),
    getProbeAssignments({ size: 200 }),
    getRepairs(),
    getOrders(),
    getOrderItems(),
    getInvoices(),
    getInvoiceLines(),
    getWaterRecs({ orderBy: '-date' }),
  ]);

  // ── Lookup maps ─────────────────────────────────────────────
  const operationMap = buildOperationMap(rawOps);
  const { billingToOperationMap, billingToOperationIds } = buildBillingToOperationMaps(rawContacts, operationMap);

  const beMap = new Map(rawBEs.map(be => [be.id, be.name || '']));
  const fieldMap = new Map(rawFields.map(f => [f.id, f]));
  const fsMap = new Map(rawFieldSeasons.map(fs => [fs.id, fs]));
  const probeMap = new Map(rawProbes.map(p => [p.id, p]));

  // BE → ops
  const beToOpIds = new Map<number, number[]>();
  rawContacts.forEach(c => {
    const opIds = c.operations?.map(o => o.id) || [];
    const beIds = c.billing_entity?.map(b => b.id) || [];
    beIds.forEach(beId => {
      const existing = beToOpIds.get(beId) || [];
      opIds.forEach(opId => { if (!existing.includes(opId)) existing.push(opId); });
      beToOpIds.set(beId, existing);
    });
  });

  // Op → BEs
  const opToBEIds = new Map<number, number[]>();
  rawContacts.forEach(c => {
    const opIds = c.operations?.map(o => o.id) || [];
    const beIds = c.billing_entity?.map(b => b.id) || [];
    opIds.forEach(opId => {
      const existing = opToBEIds.get(opId) || [];
      beIds.forEach(beId => { if (!existing.includes(beId)) existing.push(beId); });
      opToBEIds.set(opId, existing);
    });
  });

  // Field → op (via billing_entity → contacts → operation)
  const fieldToOpId = new Map<number, number>();
  const fieldToBEId = new Map<number, number>();
  rawFields.forEach(f => {
    const beId = f.billing_entity?.[0]?.id;
    if (beId) {
      fieldToBEId.set(f.id, beId);
      const opId = billingToOperationMap.get(beId);
      if (opId) fieldToOpId.set(f.id, opId);
    }
  });

  // FieldSeason → field
  const fsToFieldId = new Map<number, number>();
  rawFieldSeasons.forEach(fs => {
    const fId = fs.field?.[0]?.id;
    if (fId) fsToFieldId.set(fs.id, fId);
  });

  // Field → fieldSeason by season
  const fieldToFS = new Map<number, Map<number, typeof rawFieldSeasons[0]>>();
  rawFieldSeasons.forEach(fs => {
    const fId = fsToFieldId.get(fs.id);
    if (!fId || !fs.season) return;
    if (!fieldToFS.has(fId)) fieldToFS.set(fId, new Map());
    fieldToFS.get(fId)!.set(fs.season, fs);
  });

  // Probe serial map
  const probeSerialMap = new Map(rawProbes.map(p => [p.id, p.serial_number || '']));

  // Op → contacts
  const opToContacts = new Map<number, MobileContact[]>();
  rawContacts.forEach(c => {
    const opIds = c.operations?.map(o => o.id) || [];
    opIds.forEach(opId => {
      const existing = opToContacts.get(opId) || [];
      existing.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        isPrimary: c.is_main_contact?.value === 'Yes',
      });
      opToContacts.set(opId, existing);
    });
  });

  // ── Probe assignments for 2026 field seasons ─────────────────
  const fs2026Ids = new Set(
    rawFieldSeasons.filter(fs => fs.season === CURRENT_SEASON).map(fs => fs.id)
  );

  const pasByFS = new Map<number, typeof rawProbeAssignments[0][]>();
  rawProbeAssignments.forEach(pa => {
    const fsId = pa.field_season?.[0]?.id;
    if (!fsId) return;
    const list = pasByFS.get(fsId) || [];
    list.push(pa);
    pasByFS.set(fsId, list);
  });

  // ── Install stats ───────────────────────────────────────────
  const opInstallMap = new Map<number, { installed: number; planned: number }>();

  rawFieldSeasons.filter(fs => fs.season === CURRENT_SEASON).forEach(fs => {
    const fId = fsToFieldId.get(fs.id);
    const opId = fId ? fieldToOpId.get(fId) : undefined;
    if (!opId) return;

    const pas = pasByFS.get(fs.id) || [];
    const planned = pas.length;
    const installed = pas.filter(pa =>
      pa.probe_status?.value === 'Installed' ||
      pa.probe_status?.value === 'Active'
    ).length;

    const curr = opInstallMap.get(opId) || { installed: 0, planned: 0 };
    curr.installed += installed;
    curr.planned += planned;
    opInstallMap.set(opId, curr);
  });

  // ── Op field counts ─────────────────────────────────────────
  const opFieldCount = new Map<number, number>();
  rawFields.forEach(f => {
    const opId = fieldToOpId.get(f.id);
    if (opId) opFieldCount.set(opId, (opFieldCount.get(opId) || 0) + 1);
  });

  // ── Op probe counts (probe_assignments per season) ──────────
  const opProbeCount2026 = new Map<number, number>();
  const opProbeCount2025 = new Map<number, number>();
  rawFieldSeasons.forEach(fs => {
    const fId = fsToFieldId.get(fs.id);
    const opId = fId ? fieldToOpId.get(fId) : undefined;
    if (!opId) return;
    const pas = pasByFS.get(fs.id) || [];
    if (fs.season === CURRENT_SEASON) {
      opProbeCount2026.set(opId, (opProbeCount2026.get(opId) || 0) + pas.length);
    } else if (fs.season === PREV_SEASON) {
      opProbeCount2025.set(opId, (opProbeCount2025.get(opId) || 0) + pas.length);
    }
  });

  // ── Op revenue (from invoices by billing entity) ────────────
  const beRevenue2026 = new Map<number, number>();
  const beRevenue2025 = new Map<number, number>();
  rawInvoices.forEach(inv => {
    const beId = inv.billing_entity?.[0]?.id;
    if (!beId) return;
    const amount = asNum(inv.actual_billed_amount) || asNum(inv.amount);
    if (inv.season === CURRENT_SEASON) {
      beRevenue2026.set(beId, (beRevenue2026.get(beId) || 0) + amount);
    } else if (inv.season === PREV_SEASON) {
      beRevenue2025.set(beId, (beRevenue2025.get(beId) || 0) + amount);
    }
  });

  const opRevenue2026 = new Map<number, number>();
  const opRevenue2025 = new Map<number, number>();
  beRevenue2026.forEach((amt, beId) => {
    const opIds = billingToOperationIds.get(beId) || [];
    opIds.forEach(opId => opRevenue2026.set(opId, (opRevenue2026.get(opId) || 0) + amt));
  });
  beRevenue2025.forEach((amt, beId) => {
    const opIds = billingToOperationIds.get(beId) || [];
    opIds.forEach(opId => opRevenue2025.set(opId, (opRevenue2025.get(opId) || 0) + amt));
  });

  // ── Op booking status ────────────────────────────────────────
  const opsWithFS2026 = new Set<number>();
  const opsWithFS2025 = new Set<number>();
  rawFieldSeasons.forEach(fs => {
    const fId = fsToFieldId.get(fs.id);
    const opId = fId ? fieldToOpId.get(fId) : undefined;
    if (!opId) return;
    if (fs.season === CURRENT_SEASON) opsWithFS2026.add(opId);
    if (fs.season === PREV_SEASON) opsWithFS2025.add(opId);
  });

  // ── Operations ───────────────────────────────────────────────
  const operations: MobileOperation[] = rawOps.map(op => {
    const beIds = opToBEIds.get(op.id) || [];
    const beNames = beIds.map(id => beMap.get(id) || '').filter(Boolean);
    const has2026 = opsWithFS2026.has(op.id);
    const has2025 = opsWithFS2025.has(op.id);
    const status: MobileOperation['status'] =
      has2026 && has2025 ? 'returning' :
      has2026 && !has2025 ? 'new' :
      !has2026 && has2025 ? 'still-to-go' : 'unknown';

    return {
      id: op.id,
      name: op.name,
      initials: getInitials(op.name),
      status,
      fieldCount: opFieldCount.get(op.id) || 0,
      probeCount2026: opProbeCount2026.get(op.id) || 0,
      probeCount2025: opProbeCount2025.get(op.id) || 0,
      revenue2026: opRevenue2026.get(op.id) || 0,
      revenue2025: opRevenue2025.get(op.id) || 0,
      notes: op.notes,
      contacts: opToContacts.get(op.id) || [],
      billingEntityIds: beIds,
      billingEntityNames: beNames,
    };
  });

  // ── Fields ───────────────────────────────────────────────────
  const fields: MobileField[] = rawFields.map(f => {
    const opId = fieldToOpId.get(f.id);
    const beId = fieldToBEId.get(f.id);
    const fs2026 = fieldToFS.get(f.id)?.get(CURRENT_SEASON);
    const probeCount = fs2026 ? (pasByFS.get(fs2026.id) || []).length : 0;

    return {
      id: f.id,
      fieldSeasonId2026: fs2026?.id,
      name: f.name,
      operationId: opId,
      operationName: opId ? (operationMap.get(opId) || '') : '',
      billingEntityId: beId,
      acres: asNum(f.acres),
      crop: fs2026?.crop?.value || '',
      lat: f.lat ? asNum(f.lat) : undefined,
      lng: f.lng ? asNum(f.lng) : undefined,
      soilType: typeof f.soil_type === 'string' ? f.soil_type : f.soil_type?.value,
      fieldDirections: f.field_directions,
      notes: f.notes,
      probeCount,
      plantingDate: fs2026?.planting_date,
      plannedInstaller: fs2026?.planned_installer?.value,
    };
  });

  // ── Probes ───────────────────────────────────────────────────
  // Build probeAssignment → field/op lookup
  const paFieldMap = new Map<number, { fieldId: number; fieldName: string; opId?: number; fsId?: number }>();
  rawProbeAssignments.forEach(pa => {
    const fsId = pa.field_season?.[0]?.id;
    if (!fsId) return;
    const fId = fsToFieldId.get(fsId);
    if (!fId) return;
    const field = fieldMap.get(fId);
    const opId = fId ? fieldToOpId.get(fId) : undefined;
    paFieldMap.set(pa.id, { fieldId: fId, fieldName: field?.name || '', opId, fsId });
  });

  // Probe id → latest active pa
  const probeIdToPa = new Map<number, typeof rawProbeAssignments[0]>();
  rawProbeAssignments.forEach(pa => {
    const probeId = pa.probe?.[0]?.id;
    if (!probeId) return;
    const existing = probeIdToPa.get(probeId);
    // Prefer active (non-removed) probe assignments
    if (!existing || (pa.probe_status?.value !== 'Removed' && existing.probe_status?.value === 'Removed')) {
      probeIdToPa.set(probeId, pa);
    }
  });

  const probes: MobileProbe[] = rawProbes.map(p => {
    const pa = probeIdToPa.get(p.id);
    const paInfo = pa ? paFieldMap.get(pa.id) : undefined;
    const opId = paInfo?.opId;

    return {
      id: p.id,
      serialNumber: p.serial_number || `#${p.id}`,
      status: p.status?.value || 'Unknown',
      operationId: opId,
      operationName: opId ? (operationMap.get(opId) || '') : '',
      fieldId: paInfo?.fieldId,
      fieldName: paInfo?.fieldName || '',
      fieldSeasonId: paInfo?.fsId,
      model: p.brand?.value || '',
      installedDate: pa?.install_date,
      lat: pa?.install_lat ? asNum(pa.install_lat) : undefined,
      lng: pa?.install_lng ? asNum(pa.install_lng) : undefined,
      notes: p.notes,
    };
  });

  // ── Repairs ───────────────────────────────────────────────────
  const repairs: MobileRepair[] = rawRepairs.map(r => {
    const fsId = r.field_season?.[0]?.id;
    const fs = fsId ? fsMap.get(fsId) : undefined;
    const fId = fs ? fsToFieldId.get(fs.id) : undefined;
    const field = fId ? fieldMap.get(fId) : undefined;
    const opId = fId ? fieldToOpId.get(fId) : undefined;

    const paId = r.probe_assignment?.[0]?.id;
    const pa = paId ? rawProbeAssignments.find(p => p.id === paId) : undefined;
    const probeSerial = pa?.probe?.[0]?.id ? probeSerialMap.get(pa.probe[0].id) : undefined;

    return {
      id: r.id,
      fieldSeasonId: fsId,
      fieldId: fId,
      fieldName: field?.name || r.field_season?.[0]?.value || 'Unknown Field',
      operationName: opId ? (operationMap.get(opId) || '') : '',
      reportedAt: r.reported_at || '',
      problem: r.problem || 'No description',
      fix: r.fix,
      repairedAt: r.repaired_at,
      notifiedCustomer: r.notified_customer || false,
      probeSerial,
      probeReplaced: r.probe_replaced || false,
      newProbeSerial: r.new_probe_serial,
      status: (r.repaired_at ? 'resolved' : 'open') as 'open' | 'resolved',
    };
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
  });

  // ── Orders ────────────────────────────────────────────────────
  const itemsByOrder = new Map<number, MobileOrder['items']>();
  rawOrderItems.forEach(item => {
    const orderId = item.order_link?.[0]?.id;
    if (!orderId) return;
    const list = itemsByOrder.get(orderId) || [];
    list.push({
      id: item.id,
      productName: item.product?.[0]?.value || 'Unknown',
      quantity: item.quantity || 0,
      unitPrice: item.unit_price ? parseFloat(item.unit_price) : 0,
    });
    itemsByOrder.set(orderId, list);
  });

  const orders: MobileOrder[] = rawOrders.map(o => {
    const beId = o.billing_entity?.[0]?.id;
    const items = itemsByOrder.get(o.id) || [];
    const opId = beId ? billingToOperationMap.get(beId) : undefined;
    return {
      id: o.id,
      billingEntityId: beId,
      billingEntityName: beId ? (beMap.get(beId) || '') : '',
      operationName: opId ? (operationMap.get(opId) || '') : '',
      orderDate: o.order_date || '',
      status: o.status?.value || 'Quote',
      notes: o.notes || '',
      quoteValidDays: o.quote_valid_days || 30,
      items,
      total: items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
    };
  }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  // ── Invoices ──────────────────────────────────────────────────
  const linesByInvoice = new Map<number, MobileInvoiceLine[]>();
  rawInvoiceLines.forEach(line => {
    const invId = line.invoice?.[0]?.id;
    if (!invId) return;
    const fsId = line.field_season?.[0]?.id;
    const fId = fsId ? fsToFieldId.get(fsId) : undefined;
    const field = fId ? fieldMap.get(fId) : undefined;
    const list = linesByInvoice.get(invId) || [];
    const qty = line.quantity || 0;
    const rate = asNum(line.rate);
    list.push({
      id: line.id,
      fieldName: field?.name || line.field_season?.[0]?.value || '—',
      service: line.service_type || '',
      qty,
      rate,
      total: qty * rate,
    });
    linesByInvoice.set(invId, list);
  });

  const invoices: MobileInvoice[] = rawInvoices.map(inv => {
    const beId = inv.billing_entity?.[0]?.id;
    const opId = beId ? billingToOperationMap.get(beId) : undefined;
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      billingEntityId: beId,
      billingEntityName: beId ? (beMap.get(beId) || '') : '',
      operationName: opId ? (operationMap.get(opId) || '') : '',
      season: inv.season,
      calcAmount: asNum(inv.amount),
      billedAmount: inv.actual_billed_amount ? asNum(inv.actual_billed_amount) : undefined,
      status: inv.status?.value || 'Draft',
      sentAt: inv.sent_at,
      paidAt: inv.paid_at,
      depositAt: inv.deposit_at,
      checkNumber: inv.check_number,
      matchedInQb: inv.matched_in_qb || false,
      lineItems: linesByInvoice.get(inv.id) || [],
    };
  });

  // ── Water Recs ────────────────────────────────────────────────
  const waterRecs: MobileWaterRec[] = rawWaterRecs.map(w => {
    const fsId = w.field_season?.[0]?.id;
    const fId = fsId ? fsToFieldId.get(fsId) : undefined;
    const field = fId ? fieldMap.get(fId) : undefined;
    const opId = fId ? fieldToOpId.get(fId) : undefined;
    return {
      id: w.id,
      fieldSeasonId: fsId,
      fieldId: fId,
      fieldName: field?.name || w.field_season?.[0]?.value || 'Unknown Field',
      operationId: opId,
      operationName: opId ? (operationMap.get(opId) || '') : '',
      date: w.date,
      recommendation: w.recommendation || '',
      suggestedWaterDay: w.suggested_water_day?.value,
    };
  });

  // ── Install stats ─────────────────────────────────────────────
  const installStats = {
    totalInstalled: Array.from(opInstallMap.values()).reduce((s, v) => s + v.installed, 0),
    totalPlanned: Array.from(opInstallMap.values()).reduce((s, v) => s + v.planned, 0),
    byOp: rawOps
      .filter(op => (opInstallMap.get(op.id)?.planned || 0) > 0)
      .map(op => {
        const stats = opInstallMap.get(op.id) || { installed: 0, planned: 0 };
        return {
          opId: op.id,
          opName: op.name,
          initials: getInitials(op.name),
          installed: stats.installed,
          planned: stats.planned,
        };
      }),
  };

  return { operations, fields, probes, repairs, orders, invoices, waterRecs, installStats };
}

// ── Page ─────────────────────────────────────────────────────────

export default async function MobilePage() {
  let data: MobileData;
  try {
    data = await loadMobileData();
  } catch (err) {
    console.error('Mobile data load error:', err);
    data = {
      operations: [], fields: [], probes: [], repairs: [],
      orders: [], invoices: [], waterRecs: [],
      installStats: { totalInstalled: 0, totalPlanned: 0, byOp: [] },
    };
  }

  return <MobileApp data={data} />;
}
