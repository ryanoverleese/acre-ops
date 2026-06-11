import { NextRequest, NextResponse } from 'next/server';
import {
  TABLE_IDS,
  getCachedRows,
  type Probe,
  type ProbeRackSlot,
  type ProbeAssignment,
  type FieldSeason,
  type Field,
} from '@/lib/baserow';

export const dynamic = 'force-dynamic';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export interface ProbeSearchResult {
  id: number;
  serialNumber: string;
  brand: string;
  billingEntity: string;
  rack: string;
  rackSlot: string;
  currentField: string;
}

export async function GET(request: NextRequest) {
  const search = (request.nextUrl.searchParams.get('search') ?? request.nextUrl.searchParams.get('serial') ?? '').trim();
  if (!search) return NextResponse.json({ results: [] });

  try {
    // Live search the probes table by serial number
    const params = new URLSearchParams({ user_field_names: 'true', size: '20', search });
    const probeRes = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.probes}/?${params}`, {
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    if (!probeRes.ok) return NextResponse.json({ results: [] });
    const probes: Probe[] = (await probeRes.json()).results ?? [];
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
}
