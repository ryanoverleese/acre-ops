import { NextResponse } from 'next/server';
import { getCachedRows, type FieldSeason, type Field, type Contact, type Operation, type ProbeAssignment } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const revalidate = 600; // Cache for 10 minutes

export async function GET() {
  try {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const fieldSeasons = await getCachedRows<FieldSeason>('field_seasons', undefined, 600);
    const fields = await getCachedRows<Field>('fields', undefined, 600);
    const contacts = await getCachedRows<Contact>('contacts', undefined, 600);
    const operations = await getCachedRows<Operation>('operations', undefined, 600);
    const probeAssignments = await getCachedRows<ProbeAssignment>('probe_assignments', undefined, 600);

    const operationMap = buildOperationMap(operations);
    const fullOpMap = new Map(operations.map(op => [op.id, op]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map(f => [f.id, f]));

    const notReturningTag = `[NOT_RETURNING_${currentYear}]`;

    // Map field_season ID → operation ID for current and previous season
    const fsToOp = new Map<number, number>();
    const fsToOpPrev = new Map<number, number>();
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

      if (fs.season == currentYear) fsToOp.set(fs.id, opId);
      if (fs.season == previousYear) fsToOpPrev.set(fs.id, opId);

      const bucket = fs.season == previousYear ? opFieldsPrev : opFieldsCurr;
      if (!bucket.has(opId)) bucket.set(opId, new Set());
      bucket.get(opId)!.add(fieldId);
    }

    // Count probe assignments per operation for current and previous season
    const opProbesCurr = new Map<number, number>();
    const opProbesPrev = new Map<number, number>();
    for (const pa of probeAssignments) {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) continue;
      const opIdCurr = fsToOp.get(fsId);
      if (opIdCurr) opProbesCurr.set(opIdCurr, (opProbesCurr.get(opIdCurr) || 0) + 1);
      const opIdPrev = fsToOpPrev.get(fsId);
      if (opIdPrev) opProbesPrev.set(opIdPrev, (opProbesPrev.get(opIdPrev) || 0) + 1);
    }

    const allOpIds = new Set([...opFieldsPrev.keys(), ...opFieldsCurr.keys()]);
    const bookings: { operationId: number; operationName: string; operationNotes: string; fieldsPrev: number; fieldsCurr: number; probesPrev: number; probesCurr: number; status: string }[] = [];

    // Count previous-year fields not yet enrolled in current year
    let totalRemainingFields = 0;
    for (const opId of allOpIds) {
      const fieldsPrev = opFieldsPrev.get(opId);
      const fieldsCurr = opFieldsCurr.get(opId);
      if (fieldsPrev) {
        for (const fieldId of fieldsPrev) {
          if (!fieldsCurr || !fieldsCurr.has(fieldId)) totalRemainingFields++;
        }
      }
    }

    for (const opId of allOpIds) {
      const countPrev = opFieldsPrev.get(opId)?.size || 0;
      const countCurr = opFieldsCurr.get(opId)?.size || 0;
      const op = fullOpMap.get(opId);
      const notes = op?.notes || '';

      let status: string;
      if (countPrev > 0 && countCurr > 0) status = 'returning';
      else if (countPrev > 0) {
        status = notes.includes(notReturningTag) ? 'not-returning' : 'still-to-go';
      } else status = 'new';

      bookings.push({
        operationId: opId,
        operationName: operationMap.get(opId) || 'Unknown',
        operationNotes: notes,
        fieldsPrev: countPrev,
        fieldsCurr: countCurr,
        probesPrev: opProbesPrev.get(opId) || 0,
        probesCurr: opProbesCurr.get(opId) || 0,
        status,
      });
    }

    const statusOrder: Record<string, number> = { 'still-to-go': 0, 'new': 1, 'returning': 2, 'not-returning': 3 };
    bookings.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99) || a.operationName.localeCompare(b.operationName));

    return NextResponse.json({ bookings, remainingFields: totalRemainingFields, currentYear, previousYear });
  } catch (error) {
    console.error('Bookings API error:', (error as Error).message);
    return NextResponse.json({ bookings: [], remainingFields: 0, currentYear: new Date().getFullYear(), previousYear: new Date().getFullYear() - 1 }, { status: 200 });
  }
}
