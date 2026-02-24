import { NextResponse } from 'next/server';
import { getCachedRows, type FieldSeason, type Field, type Contact, type Operation, type ProbeAssignment } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const revalidate = 600; // Cache for 10 minutes

export async function GET() {
  try {
    const fieldSeasons = await getCachedRows<FieldSeason>('field_seasons', undefined, 600);
    const fields = await getCachedRows<Field>('fields', undefined, 600);
    const contacts = await getCachedRows<Contact>('contacts', undefined, 600);
    const operations = await getCachedRows<Operation>('operations', undefined, 600);
    const probeAssignments = await getCachedRows<ProbeAssignment>('probe_assignments', undefined, 600);

    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map(f => [f.id, f]));

    // Map field_season ID → operation ID for 2026 seasons
    const fsToOp = new Map<number, number>();
    const opFields2025 = new Map<number, Set<number>>();
    const opFields2026 = new Map<number, Set<number>>();

    for (const fs of fieldSeasons) {
      if (fs.season != 2025 && fs.season != 2026) continue;
      const fieldId = fs.field?.[0]?.id;
      if (!fieldId) continue;
      const field = fieldMap.get(fieldId);
      const beId = field?.billing_entity?.[0]?.id;
      if (!beId) continue;
      const opId = billingToOperationMap.get(beId);
      if (!opId) continue;

      if (fs.season == 2026) fsToOp.set(fs.id, opId);

      const bucket = fs.season == 2025 ? opFields2025 : opFields2026;
      if (!bucket.has(opId)) bucket.set(opId, new Set());
      bucket.get(opId)!.add(fieldId);
    }

    // Count 2026 probe assignments per operation
    const opProbes2026 = new Map<number, number>();
    for (const pa of probeAssignments) {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) continue;
      const opId = fsToOp.get(fsId);
      if (!opId) continue;
      opProbes2026.set(opId, (opProbes2026.get(opId) || 0) + 1);
    }

    const allOpIds = new Set([...opFields2025.keys(), ...opFields2026.keys()]);
    const bookings: { operationName: string; fields2025: number; fields2026: number; probes2026: number; status: string }[] = [];

    for (const opId of allOpIds) {
      const count2025 = opFields2025.get(opId)?.size || 0;
      const count2026 = opFields2026.get(opId)?.size || 0;
      let status: string;
      if (count2025 > 0 && count2026 > 0) status = 'returning';
      else if (count2025 > 0) status = 'still-to-go';
      else status = 'new';

      bookings.push({
        operationName: operationMap.get(opId) || 'Unknown',
        fields2025: count2025,
        fields2026: count2026,
        probes2026: opProbes2026.get(opId) || 0,
        status,
      });
    }

    const statusOrder: Record<string, number> = { 'still-to-go': 0, 'new': 1, 'returning': 2 };
    bookings.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.operationName.localeCompare(b.operationName));

    return NextResponse.json(bookings);
  } catch (error) {
    console.error('Bookings API error:', (error as Error).message);
    return NextResponse.json([], { status: 200 });
  }
}
