import { NextResponse } from 'next/server';
import {
  getCachedRows,
  type Field,
  type Contact,
  type Operation,
  type Probe,
  type ProbeAssignment,
  type FieldSeason,
  type Repair,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const revalidate = 120;

export interface AttentionItem {
  id: number;
  label: string;
  href: string;
}

export interface AttentionGroup {
  key: string;
  label: string;
  description: string;
  count: number;
  items: AttentionItem[];
}

export interface NeedsAttentionResponse {
  groups: AttentionGroup[];
  totalCount: number;
}

export async function GET() {
  try {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const notReturningTag = `[NOT_RETURNING_${currentYear}]`;

    const [fields, contacts, operations, probes, probeAssignments, fieldSeasons, repairs] =
      await Promise.all([
        getCachedRows<Field>('fields', undefined, 120),
        getCachedRows<Contact>('contacts', undefined, 120),
        getCachedRows<Operation>('operations', undefined, 120),
        getCachedRows<Probe>('probes', undefined, 120),
        getCachedRows<ProbeAssignment>('probe_assignments', undefined, 120),
        getCachedRows<FieldSeason>('field_seasons', undefined, 120),
        getCachedRows<Repair>('repairs', undefined, 120),
      ]);

    // ── Current season setup ─────────────────────────────────────────────────
    const currentFsIds = new Set(
      fieldSeasons.filter((fs) => fs.season == currentYear).map((fs) => fs.id)
    );
    const currentSeasonAssignments = probeAssignments.filter((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      return fsId && currentFsIds.has(fsId);
    });

    // ── Operations still-to-go (had previous year, not yet in current year) ──
    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    const opFieldsPrev = new Map<number, Set<number>>();
    const opFieldsCurr = new Map<number, Set<number>>();
    for (const fs of fieldSeasons) {
      if (fs.season != previousYear && fs.season != currentYear) continue;
      const fieldId = fs.field?.[0]?.id;
      if (!fieldId) continue;
      const field = fieldMap.get(fieldId);
      const beId = field?.billing_entity?.[0]?.id;
      if (!beId) continue;
      const opId = billingToOperationMap.get(beId);
      if (!opId) continue;
      const bucket = fs.season == previousYear ? opFieldsPrev : opFieldsCurr;
      if (!bucket.has(opId)) bucket.set(opId, new Set());
      bucket.get(opId)!.add(fieldId);
    }

    // ── Contacts with operation lookup ───────────────────────────────────────
    const opHasContact = new Set<number>();
    for (const c of contacts) {
      for (const op of c.operations || []) opHasContact.add(op.id);
    }

    // ── Field season → field name map ────────────────────────────────────────
    const fsFieldNameMap = new Map<number, string>();
    fieldSeasons.forEach((fs) => {
      fsFieldNameMap.set(fs.id, fs.field?.[0]?.value || 'Unknown Field');
    });

    const groups: AttentionGroup[] = [];

    // ── Fields missing location ──────────────────────────────────────────────
    {
      const items: AttentionItem[] = fields
        .filter((f) => !f.lat || !f.lng)
        .map((f) => ({ id: f.id, label: f.name, href: `/fields/${f.id}` }));
      groups.push({
        key: 'fields_no_location',
        label: 'Fields Missing Location',
        description: 'No lat/lng — won\'t appear on maps',
        count: items.length,
        items,
      });
    }

    // ── Fields missing billing entity ────────────────────────────────────────
    {
      const items: AttentionItem[] = fields
        .filter((f) => !f.billing_entity?.length)
        .map((f) => ({ id: f.id, label: f.name, href: `/fields/${f.id}` }));
      groups.push({
        key: 'fields_no_billing_entity',
        label: 'Fields Without Billing Entity',
        description: 'Not linked to any billing entity',
        count: items.length,
        items,
      });
    }

    // ── Contacts missing email ───────────────────────────────────────────────
    {
      const items: AttentionItem[] = contacts
        .filter((c) => !c.email)
        .map((c) => ({ id: c.id, label: c.name, href: `/contacts/${c.id}` }));
      groups.push({
        key: 'contacts_no_email',
        label: 'Contacts Without Email',
        description: 'Can\'t send correspondence',
        count: items.length,
        items,
      });
    }

    // ── Contacts missing address ─────────────────────────────────────────────
    {
      const items: AttentionItem[] = contacts
        .filter((c) => !c.address)
        .map((c) => ({ id: c.id, label: c.name, href: `/contacts/${c.id}` }));
      groups.push({
        key: 'contacts_no_address',
        label: 'Contacts Without Address',
        description: 'Mailing address is blank',
        count: items.length,
        items,
      });
    }

    // ── Contacts missing phone ───────────────────────────────────────────────
    {
      const items: AttentionItem[] = contacts
        .filter((c) => !c.phone)
        .map((c) => ({ id: c.id, label: c.name, href: `/contacts/${c.id}` }));
      groups.push({
        key: 'contacts_no_phone',
        label: 'Contacts Without Phone',
        description: 'No phone number on file',
        count: items.length,
        items,
      });
    }

    // ── Contacts not linked to any operation ─────────────────────────────────
    {
      const items: AttentionItem[] = contacts
        .filter((c) => !c.operations?.length)
        .map((c) => ({ id: c.id, label: c.name, href: `/contacts/${c.id}` }));
      groups.push({
        key: 'contacts_no_operation',
        label: 'Contacts Not Linked to an Operation',
        description: 'Orphaned — no operation association',
        count: items.length,
        items,
      });
    }

    // ── Operations with no contacts ──────────────────────────────────────────
    {
      const items: AttentionItem[] = operations
        .filter((op) => !opHasContact.has(op.id))
        .map((op) => ({ id: op.id, label: op.name, href: `/operations/${op.id}` }));
      groups.push({
        key: 'operations_no_contacts',
        label: 'Operations With No Contacts',
        description: 'Nobody linked to talk to',
        count: items.length,
        items,
      });
    }

    // ── Operations still-to-go (had fields last year, none yet this year) ────
    {
      const items: AttentionItem[] = [];
      for (const op of operations) {
        const hadPrev = (opFieldsPrev.get(op.id)?.size || 0) > 0;
        const hasCurr = (opFieldsCurr.get(op.id)?.size || 0) > 0;
        const dismissed = op.notes?.includes(notReturningTag);
        if (hadPrev && !hasCurr && !dismissed) {
          items.push({ id: op.id, label: op.name, href: `/operations/${op.id}` });
        }
      }
      groups.push({
        key: 'operations_still_to_go',
        label: `${currentYear}: Operations Still to Go`,
        description: `Had fields in ${previousYear} but not yet enrolled for ${currentYear}`,
        count: items.length,
        items,
      });
    }

    // ── Current season: unassigned probe slots ───────────────────────────────
    {
      const items: AttentionItem[] = currentSeasonAssignments
        .filter((pa) => {
          const status = pa.probe_status?.value?.toLowerCase();
          return !status || status === 'unassigned';
        })
        .map((pa) => {
          const fsId = pa.field_season?.[0]?.id;
          const fieldName = (fsId && fsFieldNameMap.get(fsId)) || pa.field_season?.[0]?.value || `Assignment #${pa.id}`;
          return { id: pa.id, label: fieldName, href: '/install' };
        });
      groups.push({
        key: 'probes_unassigned',
        label: `${currentYear}: Unassigned Probe Slots`,
        description: 'Field seasons with no probe selected yet',
        count: items.length,
        items,
      });
    }

    // ── Current season: assigned/installed probes missing placement location ─
    {
      const items: AttentionItem[] = currentSeasonAssignments
        .filter((pa) => {
          const status = pa.probe_status?.value?.toLowerCase();
          if (!status || status === 'unassigned') return false;
          return !pa.placement_lat || !pa.placement_lng;
        })
        .map((pa) => {
          const fsId = pa.field_season?.[0]?.id;
          const fieldName = (fsId && fsFieldNameMap.get(fsId)) || pa.field_season?.[0]?.value || `Assignment #${pa.id}`;
          return { id: pa.id, label: fieldName, href: '/install' };
        });
      groups.push({
        key: 'probes_no_placement_location',
        label: `${currentYear}: Probes Missing Placement Location`,
        description: 'Assigned or installed but no placement lat/lng',
        count: items.length,
        items,
      });
    }

    // ── In-stock probes with no rack ─────────────────────────────────────────
    {
      const items: AttentionItem[] = probes
        .filter((p) => p.status?.value?.toLowerCase() === 'in stock' && !p.rack)
        .map((p) => ({
          id: p.id,
          label: p.serial_number || `Probe #${p.id}`,
          href: `/probes/${p.id}`,
        }));
      groups.push({
        key: 'probes_in_stock_no_rack',
        label: 'In-Stock Probes Without Rack Location',
        description: 'In storage but no rack/slot assigned',
        count: items.length,
        items,
      });
    }

    // ── Open repairs ─────────────────────────────────────────────────────────
    {
      const items: AttentionItem[] = repairs
        .filter((r) => !r.repaired_at)
        .map((r) => {
          const fsId = r.field_season?.[0]?.id;
          const fieldName = (fsId && fsFieldNameMap.get(fsId)) || r.field_season?.[0]?.value || `Repair #${r.id}`;
          return {
            id: r.id,
            label: r.problem ? `${fieldName} — ${r.problem}` : fieldName,
            href: '/repairs',
          };
        });
      groups.push({
        key: 'repairs_open',
        label: 'Open Repairs',
        description: 'Reported but not yet fixed',
        count: items.length,
        items,
      });
    }

    // ── Repairs fixed but customer not notified ──────────────────────────────
    {
      const items: AttentionItem[] = repairs
        .filter((r) => r.repaired_at && !r.notified_customer)
        .map((r) => {
          const fsId = r.field_season?.[0]?.id;
          const fieldName = (fsId && fsFieldNameMap.get(fsId)) || r.field_season?.[0]?.value || `Repair #${r.id}`;
          return { id: r.id, label: fieldName, href: '/repairs' };
        });
      groups.push({
        key: 'repairs_not_notified',
        label: 'Repairs Done — Customer Not Notified',
        description: 'Fixed but customer hasn\'t been told yet',
        count: items.length,
        items,
      });
    }

    const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

    return NextResponse.json({ groups, totalCount } as NeedsAttentionResponse);
  } catch (error) {
    console.error('Needs attention API error:', (error as Error).message);
    return NextResponse.json({ groups: [], totalCount: 0 }, { status: 200 });
  }
}
