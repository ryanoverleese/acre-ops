import { NextResponse } from 'next/server';
import { getCachedRows, getRows } from '@/lib/baserow';

/**
 * The pull route: every probe currently in the ground, ordered the way the
 * crew drives it.
 *
 * The install route asks "what is ready to go in". This asks the opposite —
 * probe_status is Installed and nothing has recorded it coming out. Already
 * removed rows come back too, marked done, so a half-finished day still shows
 * what has been covered.
 *
 * Not filtered by installer. Whoever is out that day pulls what they reach;
 * tying a removal to the person who put it in would leave probes stranded when
 * that installer is not working.
 */

interface Row { [key: string]: unknown }
const val = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(val).filter(Boolean).join(', ');
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return String((v as { value: unknown }).value ?? '');
  }
  return v == null ? '' : String(v);
};
const linkId = (v: unknown): number | null =>
  Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'id' in (v[0] as Record<string, unknown>)
    ? Number((v[0] as { id: number }).id) : null;
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);
  const fresh = searchParams.get('fresh') === '1';

  try {
    const [assignments, fieldSeasons, fields, probes, billingEntities] = await Promise.all([
      fresh ? getRows<Row>('probe_assignments') : getCachedRows<Row>('probe_assignments', undefined, 60),
      fresh ? getRows<Row>('field_seasons') : getCachedRows<Row>('field_seasons', undefined, 60),
      getCachedRows<Row>('fields', undefined, 300),
      getCachedRows<Row>('probes', undefined, 300),
      getCachedRows<Row>('billing_entities', undefined, 300),
    ]);

    const fsMap = new Map(fieldSeasons.map((r) => [Number(r.id), r]));
    const fieldMap = new Map(fields.map((r) => [Number(r.id), r]));
    const probeMap = new Map(probes.map((r) => [Number(r.id), r]));
    const billingEntityMap = new Map(billingEntities.map((r) => [Number(r.id), r]));

    const rows = assignments
      .filter((pa) => {
        const fsId = linkId(pa.field_season);
        if (!fsId) return false;
        const fs = fsMap.get(fsId);
        if (!fs || Number(fs.season) !== season) return false;
        const status = val(pa.probe_status).toLowerCase();
        // In the ground, or already pulled this season — nothing else.
        return status === 'installed' || status === 'removed';
      })
      .map((pa) => {
        const fs = fsMap.get(linkId(pa.field_season)!)!;
        const field = fieldMap.get(linkId(fs.field) ?? -1);
        const probe = probeMap.get(linkId(pa.probe) ?? -1);
        const billingEntity = billingEntityMap.get(linkId(field?.billing_entity) ?? -1);
        const removed = val(pa.probe_status).toLowerCase() === 'removed';
        return {
          id: Number(pa.id),
          fieldName: val(field?.name) || 'Unknown Field',
          grower: val(billingEntity?.name) || val(fs.grower),
          routeOrder: val(fs.route_order),
          probeNumber: num(pa.probe_number) || 1,
          label: val(pa.label),
          probeSerial: val(probe?.serial_number),
          antennaType: val(pa.antenna_type),
          lat: num(pa.install_lat ?? pa.placement_lat ?? field?.lat),
          lng: num(pa.install_lng ?? pa.placement_lng ?? field?.lng),
          installedOn: val(pa.install_date).slice(0, 10),
          installedBy: val(pa.installer),
          // Notes the crew needs on the way out: gate codes, where it sits.
          fieldNotes: [val(fs.notes), val(pa.placement_notes)].filter(Boolean).join('\n\n'),
          removed,
          removedOn: val(pa.removal_date).slice(0, 10),
          removedBy: val(pa.removed_by),
          removalNotes: val(pa.removal_notes),
        };
      })
      .sort((a, b) => {
        if (a.removed !== b.removed) return a.removed ? 1 : -1;   // still-out first
        const ra = a.routeOrder || 'zzz', rb = b.routeOrder || 'zzz';
        if (ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
        if (a.fieldName !== b.fieldName) return a.fieldName.localeCompare(b.fieldName);
        return a.probeNumber - b.probeNumber;
      });

    return NextResponse.json({
      season,
      remaining: rows.filter((r) => !r.removed).length,
      pulled: rows.filter((r) => r.removed).length,
      rows,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
