import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRows,
  getRows,
  getProbeAssignments,
  type Field,
  type FieldSeason,
  type Probe,
  type Operation,
  type BillingEntity,
  type Contact,
  type ProbeRackSlot,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const installer = searchParams.get('installer');
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);
  const debug = searchParams.get('debug') === '1';
  const fresh = searchParams.get('fresh') === '1';

  if (!installer) {
    return NextResponse.json({ error: 'installer param required' }, { status: 400 });
  }

  try {
    // When fresh=1, skip the cache so updates in Baserow (planned_installer,
    // route_order, etc.) show up immediately when the user taps refresh.
    const read = {
      fields: fresh ? getRows<Field>('fields') : getCachedRows<Field>('fields', undefined, 120),
      fieldSeasons: fresh ? getRows<FieldSeason>('field_seasons') : getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      probes: fresh ? getRows<Probe>('probes') : getCachedRows<Probe>('probes', undefined, 120),
      billingEntities: fresh ? getRows<BillingEntity>('billing_entities') : getCachedRows<BillingEntity>('billing_entities', undefined, 300),
      operations: fresh ? getRows<Operation>('operations') : getCachedRows<Operation>('operations', undefined, 300),
      contacts: fresh ? getRows<Contact>('contacts') : getCachedRows<Contact>('contacts', undefined, 300),
      rackSlots: fresh ? getRows<ProbeRackSlot>('probe_rack') : getCachedRows<ProbeRackSlot>('probe_rack', undefined, 120),
    };
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts, rackSlots] =
      await Promise.all([
        read.fields,
        read.fieldSeasons,
        read.probes,
        read.billingEntities,
        read.operations,
        getProbeAssignments(),
        read.contacts,
        read.rackSlots,
      ]);

    const operationMap = buildOperationMap(operations);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    // Map probe id → { rack, slot }
    const probeRackMap = new Map<number, { rack: string; slot: number }>();
    for (const rs of rackSlots) {
      const probeId = rs.probe?.[0]?.id;
      if (probeId) probeRackMap.set(probeId, { rack: rs.rack, slot: rs.rack_slot });
    }

    // Diagnostic counters
    const stepCounts = { totalPA: probeAssignments.length, withFS: 0, inSeason: 0, matchedInstaller: 0, readyOrInstalled: 0 };
    const seenInstallers = new Set<string>();
    const seenSeasons = new Set<number | string>();
    const droppedExamples: Array<{ paId: number; reason: string; fsInstaller?: string; fsSeason?: number | string; ready?: unknown; status?: string }> = [];

    const assignments = probeAssignments
      .filter((pa) => {
        const fsId = pa.field_season?.[0]?.id;
        if (!fsId) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'no field_season link' }); return false; }
        stepCounts.withFS++;
        const fs = fieldSeasonMap.get(fsId);
        if (!fs) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'field_season not found' }); return false; }
        if (fs.season != null) seenSeasons.add(fs.season);
        if (fs.planned_installer?.value) seenInstallers.add(fs.planned_installer.value);
        if (Number(fs.season) !== season) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'season mismatch', fsSeason: fs.season }); return false; }
        stepCounts.inSeason++;
        if (fs.planned_installer?.value !== installer) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'installer mismatch', fsInstaller: fs.planned_installer?.value }); return false; }
        stepCounts.matchedInstaller++;
        // Must be marked ready_to_install on the field_season, OR already installed
        // (keep installed ones visible so they show under the Done filter).
        const status = (pa.probe_status?.value ?? '').toLowerCase();
        const isInstalled = status === 'installed';
        if (!fs.ready_to_install && !isInstalled) {
          if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'not ready_to_install', ready: fs.ready_to_install, status });
          return false;
        }
        stepCounts.readyOrInstalled++;
        return true;
      })
      .map((pa) => {
        const fsId = pa.field_season![0].id;
        const fs = fieldSeasonMap.get(fsId)!;
        const fieldId = fs.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;

        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }

        const probeId = pa.probe?.[0]?.id ?? null;
        const probe = probeId ? probeMap.get(probeId) : null;
        const rackInfo = probeId ? probeRackMap.get(probeId) : null;

        return {
          id: pa.id,
          fieldSeasonId: fsId,
          fieldId: field?.id ?? 0,
          fieldName: field?.name ?? 'Unknown Field',
          operation: operationName,
          lat: pa.placement_lat ?? field?.lat ?? 0,
          lng: pa.placement_lng ?? field?.lng ?? 0,
          crop: fs.crop?.value ?? '',
          sideDress: (fs.side_dress?.value ?? ''),
          rowDirection: field?.row_direction?.value ?? '',
          routeOrder: fs.route_order ?? 999,
          plannedInstaller: fs.planned_installer?.value ?? '',
          probeNumber: pa.probe_number ?? 1,
          label: pa.label ?? '',
          probeId,
          probeSerial: probe?.serial_number?.toString() ?? '',
          probeBrand: probe?.brand?.value ?? '',
          probeRack: rackInfo ? rackInfo.rack : '',
          probeRackSlot: rackInfo ? rackInfo.slot : null,
          antennaType: pa.antenna_type?.value ?? '',
          batteryType: pa.battery_type?.value ?? '',
          fieldNotes: fs.notes ?? '',
          status: pa.probe_status?.value ?? 'Assigned',
        };
      })
      .sort((a, b) => {
        if (a.routeOrder !== b.routeOrder) return a.routeOrder - b.routeOrder;
        return a.fieldName.localeCompare(b.fieldName);
      });

    if (debug) {
      return NextResponse.json({
        assignments,
        season,
        requestedInstaller: installer,
        stepCounts,
        seenInstallers: Array.from(seenInstallers).sort(),
        seenSeasons: Array.from(seenSeasons).sort(),
        droppedExamples,
      });
    }

    return NextResponse.json({ assignments, season });
  } catch (error) {
    console.error('installer assignments error:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}
