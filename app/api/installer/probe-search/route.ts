import { withApiAuth } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { getRows, getCachedRows } from '@/lib/supabase/adapter';
import type { Probe, ProbeRackSlot, ProbeAssignment, FieldSeason, Field } from '@/lib/types';

export const dynamic = 'force-dynamic';


export interface ProbeSearchResult {
  id: number;
  serialNumber: string;
  brand: string;
  billingEntity: string;
  rack: string;
  rackSlot: string;
  currentField: string;
}

export const GET = withApiAuth(async function GET(request: NextRequest) {
  const search = (request.nextUrl.searchParams.get('search') ?? request.nextUrl.searchParams.get('serial') ?? '').trim();
  if (!search) return NextResponse.json({ results: [] });

  try {
    const matchingProbes = await getRows<Probe>('probes', { search });
    const digits = search.replace(/\D/g, '');
    const rank = (p: Probe) => {
      const sn = p.serial_number != null ? String(p.serial_number) : '';
      if (!digits || !sn.includes(digits)) return 3; // matched some other field
      if (sn === digits) return 0;
      if (sn.startsWith(digits)) return 1;
      return 2;
    };
    const probes: Probe[] = matchingProbes
      .filter((p: Probe) => !digits || rank(p) < 3)
      .sort((a: Probe, b: Probe) => rank(a) - rank(b))
      .slice(0, 20);
    if (probes.length === 0) return NextResponse.json({ results: [] });

    const [rackSlots, probeAssignments, fieldSeasons, fields] = await Promise.all([
      getCachedRows<ProbeRackSlot>('probe_rack', undefined, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<Field>('fields', undefined, 120),
    ]);

    // probeId → rack location (from probe_rack table)
    const probeRackMap = new Map<number, { rack: string; slot: number }>();
    for (const slot of rackSlots) {
      const probeId = slot.probe?.[0]?.id;
      if (probeId) probeRackMap.set(probeId, { rack: slot.rack, slot: slot.rack_slot });
    }

    // field_season id → field name (current season only)
    const currentYear = new Date().getFullYear();
    const fieldMap = new Map(fields.map(f => [f.id, f.name]));
    const fsToFieldThisSeason = new Map<number, string>();
    for (const fs of fieldSeasons) {
      if (Number(fs.season) !== currentYear) continue;
      const fieldId = fs.field?.[0]?.id;
      const name = fieldId ? fieldMap.get(fieldId) : undefined;
      if (name) fsToFieldThisSeason.set(fs.id, name);
    }

    // probeId → current season field name (via probe_assignments)
    const probeFieldMap = new Map<number, string>();
    for (const pa of probeAssignments) {
      const probeId = pa.probe?.[0]?.id;
      const fsId = pa.field_season?.[0]?.id;
      if (!probeId || !fsId) continue;
      const name = fsToFieldThisSeason.get(fsId);
      if (name) probeFieldMap.set(probeId, name);
    }

    const results: ProbeSearchResult[] = probes.map(probe => {
      const rackLoc = probeRackMap.get(probe.id);
      return {
        id: probe.id,
        serialNumber: probe.serial_number ? String(probe.serial_number) : '',
        brand: probe.brand?.value || '',
        billingEntity: probe.billing_entity?.[0]?.value || '—',
        rack: rackLoc?.rack || '—',
        rackSlot: rackLoc?.slot != null ? String(rackLoc.slot) : '—',
        currentField: probeFieldMap.get(probe.id) || '—',
      };
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('installer probe-search error:', error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
});
