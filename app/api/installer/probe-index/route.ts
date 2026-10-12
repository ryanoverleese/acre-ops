import { withApiAuth } from '@/lib/supabase/api';
import { NextResponse } from 'next/server';
import {
  getCachedRows,
  type Probe,
  type ProbeRackSlot,
  type ProbeAssignment,
  type FieldSeason,
  type Field,
} from '@/lib/baserow';
import type { ProbeSearchResult } from '../probe-search/route';

export const dynamic = 'force-dynamic';

// Full probe list (serial + rack + this-season field) for the installer Probe
// lookup screen. The phone downloads this once, keeps it in localStorage, and
// filters locally so each search is instant instead of a round trip.
export const GET = withApiAuth(async function GET() {
  try {
    const [probes, rackSlots, probeAssignments, fieldSeasons, fields] = await Promise.all([
      getCachedRows<Probe>('probes', undefined, 120),
      getCachedRows<ProbeRackSlot>('probe_rack', undefined, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<Field>('fields', undefined, 120),
    ]);

    const probeRackMap = new Map<number, { rack: string; slot: number }>();
    for (const slot of rackSlots) {
      const probeId = slot.probe?.[0]?.id;
      if (probeId) probeRackMap.set(probeId, { rack: slot.rack, slot: slot.rack_slot });
    }

    const currentYear = new Date().getFullYear();
    const fieldMap = new Map(fields.map(f => [f.id, f.name]));
    const fsToFieldThisSeason = new Map<number, string>();
    for (const fs of fieldSeasons) {
      if (Number(fs.season) !== currentYear) continue;
      const fieldId = fs.field?.[0]?.id;
      const name = fieldId ? fieldMap.get(fieldId) : undefined;
      if (name) fsToFieldThisSeason.set(fs.id, name);
    }

    const probeFieldMap = new Map<number, string>();
    for (const pa of probeAssignments) {
      const probeId = pa.probe?.[0]?.id;
      const fsId = pa.field_season?.[0]?.id;
      if (!probeId || !fsId) continue;
      const name = fsToFieldThisSeason.get(fsId);
      if (name) probeFieldMap.set(probeId, name);
    }

    const results: ProbeSearchResult[] = probes
      .filter(p => p.serial_number != null && String(p.serial_number) !== '')
      .map(probe => {
        const rackLoc = probeRackMap.get(probe.id);
        return {
          id: probe.id,
          serialNumber: String(probe.serial_number),
          brand: probe.brand?.value || '',
          billingEntity: probe.billing_entity?.[0]?.value || '—',
          rack: rackLoc?.rack || '—',
          rackSlot: rackLoc?.slot != null ? String(rackLoc.slot) : '—',
          currentField: probeFieldMap.get(probe.id) || '—',
        };
      });

    return NextResponse.json({ results, builtAt: Date.now() });
  } catch (error) {
    console.error('installer probe-index error:', error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
});
