import { fieldBilling } from '@/lib/data-mappings';
import { withApiAuth } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { INSTALLER_TTL, loadTable, parseFresh } from '@/lib/installer-load';
import type { Repair, Field, FieldSeason, ProbeAssignment, Probe, BillingEntity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = withApiAuth(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fresh = parseFresh(searchParams);
  const completed = searchParams.get('status') === 'completed';

  try {
    const [repairs, fieldSeasons, fields, probeAssignments, probes, billingEntities] = await Promise.all([
      loadTable<Repair>('repairs', INSTALLER_TTL.repairs, fresh),
      loadTable<FieldSeason>('field_seasons', INSTALLER_TTL.field_seasons, fresh),
      loadTable<Field>('fields', INSTALLER_TTL.fields, fresh),
      loadTable<ProbeAssignment>('probe_assignments', INSTALLER_TTL.probe_assignments, fresh),
      loadTable<Probe>('probes', INSTALLER_TTL.probes, fresh),
      loadTable<BillingEntity>('billing_entities', INSTALLER_TTL.billing_entities, fresh),
    ]);

    const fieldMap = new Map(fields.map(f => [f.id, f]));
    const fieldSeasonMap = new Map(fieldSeasons.map(fs => [fs.id, fs]));
    const paMap = new Map(probeAssignments.map(pa => [pa.id, pa]));
    const probeMap = new Map(probes.map(p => [p.id, p]));
    const billingEntityMap = new Map(billingEntities.map(be => [be.id, be]));

    const toNum = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
      return 0;
    };

    const selected = repairs
      .filter(r => (completed ? !!r.repaired_at : !r.repaired_at))
      .map(r => {
        const fsId = r.field_season?.[0]?.id;
        const fs = fsId ? fieldSeasonMap.get(fsId) : null;
        const fieldId = fs?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;

        const operationName = fieldBilling(field).label;

        const paId = r.probe_assignment?.[0]?.id;
        const pa = paId ? paMap.get(paId) : null;
        const probeId = pa?.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;

        // Prefer the probe's installed coords for this season: the repair's linked
        // probe_assignment first, else any installed assignment on the same field_season.
        let installLat = toNum(pa?.install_lat);
        let installLng = toNum(pa?.install_lng);
        if ((!installLat || !installLng) && fsId) {
          const fallbackPa = probeAssignments.find(
            p => p.field_season?.[0]?.id === fsId && toNum(p.install_lat) && toNum(p.install_lng)
          );
          if (fallbackPa) {
            installLat = toNum(fallbackPa.install_lat);
            installLng = toNum(fallbackPa.install_lng);
          }
        }

        return {
          id: r.id,
          fieldSeasonId: fsId ?? 0,
          fieldName: field?.name ?? 'Unknown Field',
          operation: operationName,
          lat: installLat || toNum(field?.lat),
          lng: installLng || toNum(field?.lng),
          problem: r.problem ?? '',
          reportedAt: r.reported_at ?? '',
          probeSerial: probe?.serial_number?.toString() ?? '',
          probeAssignmentId: paId ?? null,
          probeNumber: pa ? (toNum(pa.probe_number) || 1) : null,
          label: pa?.label ?? '',
          watchList: !!r.watch_list,
          fix: r.fix ?? '',
          repairedAt: r.repaired_at ?? '',
        };
      });

    if (completed) {
      selected.sort((a, b) => (b.repairedAt || '').localeCompare(a.repairedAt || ''));
    }

    return NextResponse.json({ repairs: selected });
  } catch (error) {
    console.error('installer repairs error:', error);
    return NextResponse.json({ error: 'Failed to fetch repairs' }, { status: 500 });
  }
});
