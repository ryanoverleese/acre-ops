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
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);
  const fresh = searchParams.get('fresh') === '1';

  const read = {
    fields: fresh ? getRows<Field>('fields') : getCachedRows<Field>('fields', undefined, 120),
    fieldSeasons: fresh ? getRows<FieldSeason>('field_seasons') : getCachedRows<FieldSeason>('field_seasons', undefined, 60),
    probes: fresh ? getRows<Probe>('probes') : getCachedRows<Probe>('probes', undefined, 120),
    billingEntities: fresh ? getRows<BillingEntity>('billing_entities') : getCachedRows<BillingEntity>('billing_entities', undefined, 300),
    operations: fresh ? getRows<Operation>('operations') : getCachedRows<Operation>('operations', undefined, 300),
    contacts: fresh ? getRows<Contact>('contacts') : getCachedRows<Contact>('contacts', undefined, 300),
  };

  try {
    const [fields, fieldSeasons, , billingEntities, operations, probeAssignments, contacts] =
      await Promise.all([
        read.fields,
        read.fieldSeasons,
        read.probes,
        read.billingEntities,
        read.operations,
        getProbeAssignments(),
        read.contacts,
      ]);

    const operationMap = buildOperationMap(operations);
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const byInstaller: Record<string, { total: number; installed: number; installedToday: number }> = {};

    for (const pa of probeAssignments) {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) continue;
      const fs = fieldSeasonMap.get(fsId);
      if (!fs) continue;
      if (Number(fs.season) !== season) continue;
      if (!pa.probe?.[0]?.id) continue; // must have a probe assigned

      const installer = fs.planned_installer?.value ?? 'Unassigned';
      if (!byInstaller[installer]) byInstaller[installer] = { total: 0, installed: 0, installedToday: 0 };
      byInstaller[installer].total++;
      if ((pa.probe_status?.value ?? '').toLowerCase() === 'installed') {
        byInstaller[installer].installed++;
        if (pa.install_date?.slice(0, 10) === today) {
          byInstaller[installer].installedToday++;
        }
      }
    }

    const installerRows = Object.entries(byInstaller)
      .map(([name, counts]) => ({
        installer: name,
        total: counts.total,
        installed: counts.installed,
        installedToday: counts.installedToday,
        remaining: counts.total - counts.installed,
      }))
      .sort((a, b) => b.total - a.total);

    const total = installerRows.reduce((s, r) => s + r.total, 0);
    const installed = installerRows.reduce((s, r) => s + r.installed, 0);
    const installedToday = installerRows.reduce((s, r) => s + r.installedToday, 0);

    return NextResponse.json({
      season,
      total,
      installed,
      installedToday,
      remaining: total - installed,
      percent: total > 0 ? Math.round((installed / total) * 100) : 0,
      byInstaller: installerRows,
    });
  } catch (error) {
    console.error('installer summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
