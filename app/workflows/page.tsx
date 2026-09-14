import { getAllSelectOptions, getCachedProbeAssignments, getCachedRows, type Field, type FieldSeason, type Probe, type Operation, type BillingEntity, type Contact, type SelectOption } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import WorkflowsClient, { EarlyRemovalData, UninstallProbeData, RmaProbeData, OnOrderProbe } from './WorkflowsClient';
import { getHybridMaturityLabel } from '@/lib/hybrid-maturity';

export const dynamic = 'force-dynamic';

async function getWorkflowData(): Promise<{ earlyRemovals: EarlyRemovalData[]; seasonFields: EarlyRemovalData[]; earlyRemovalOptions: SelectOption[]; plannedRemoverOptions: SelectOption[]; installedProbes: UninstallProbeData[]; rmaProbes: RmaProbeData[]; brandOptions: string[]; onOrderProbes: OnOrderProbe[] }> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts, selectOptions] = await Promise.all([
      getCachedRows<Field>('fields', undefined, 300),
      getCachedRows<FieldSeason>('field_seasons', undefined, 120),
      getCachedRows<Probe>('probes', undefined, 120),
      getCachedRows<BillingEntity>('billing_entities', undefined, 300),
      getCachedRows<Operation>('operations', undefined, 300),
      getCachedProbeAssignments(),
      getCachedRows<Contact>('contacts', undefined, 300),
      getAllSelectOptions(['field_seasons']),
    ]);

    const operationMap = buildOperationMap(operations);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);

    const assignmentsByFieldSeason = new Map<number, typeof probeAssignments>();
    for (const pa of probeAssignments) {
      const fieldSeasonId = pa.field_season?.[0]?.id;
      if (!fieldSeasonId) continue;
      const current = assignmentsByFieldSeason.get(fieldSeasonId) ?? [];
      current.push(pa);
      assignmentsByFieldSeason.set(fieldSeasonId, current);
    }

    const currentSeason = new Date().getFullYear();
    const seasonFields: EarlyRemovalData[] = fieldSeasons
      .filter((fs) => Number(fs.season) === currentSeason)
      // Removals is Acre Insights pull work — Complete DIY growers handle their own
      .filter((fs) => fs.service_type?.[0]?.value !== 'CropX Complete DIY')
      // Only seasons that actually have probe assignments this year (empty field_seasons
      // e.g. Fishell stubs must not appear as Removals rows / map / stats).
      .filter((fs) => (assignmentsByFieldSeason.get(fs.id) ?? []).length > 0)
      .map((fs) => {
        const fieldId = fs.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }
        const seasonAssignments = assignmentsByFieldSeason.get(fs.id) ?? [];
        const assignmentDates = seasonAssignments
          .map((pa) => pa.removal_date)
          .filter(Boolean)
          .sort();
        const accessFlags = seasonAssignments
          .map((pa) => {
            const raw = (pa as { pickup_access?: boolean | string | null }).pickup_access;
            if (raw === true || raw === 'true' || raw === 'True' || raw === 'yes' || raw === 'Yes') return true;
            if (raw === false || raw === 'false' || raw === 'False' || raw === 'no' || raw === 'No') return false;
            return null;
          })
          .filter((flag): flag is boolean => flag !== null);
        // Needs ATV when pickup access is false. Mixed probes: any ATV-needed wins.
        let needsAtv = false;
        if (accessFlags.length) {
          needsAtv = accessFlags.some((flag) => flag === false);
        }
        const brands = Array.from(new Set(
          seasonAssignments
            .map((pa) => {
              const probeId = pa.probe?.[0]?.id;
              const probe = probeId ? probeMap.get(probeId) : null;
              return probe?.brand?.value || '';
            })
            .filter(Boolean)
        ));
        // Field fallback coords (also used when an assignment has no install/placement)
        const fieldLat = Number(field?.lat) || 0;
        const fieldLng = Number(field?.lng) || 0;
        const assignmentLats: number[] = [];
        const assignmentLngs: number[] = [];
        const assignmentLabels: string[] = [];
        const assignmentSerials: string[] = [];
        for (const pa of seasonAssignments) {
          const probeId = pa.probe?.[0]?.id;
          const probe = probeId ? probeMap.get(probeId) : null;
          const serial = probe?.serial_number?.toString() || '';
          assignmentLabels.push([pa.label, serial].filter(Boolean).join(' · '));
          assignmentSerials.push(serial);
          const aLat = Number(pa.install_lat ?? pa.placement_lat);
          const aLng = Number(pa.install_lng ?? pa.placement_lng);
          if (aLat && aLng && !Number.isNaN(aLat) && !Number.isNaN(aLng)) {
            assignmentLats.push(aLat);
            assignmentLngs.push(aLng);
          } else {
            assignmentLats.push(fieldLat);
            assignmentLngs.push(fieldLng);
          }
        }
        // Row-level lat/lng kept for FlyTo / legacy: first assignment with coords, else field
        const firstIdx = assignmentLats.findIndex((v, i) => v && assignmentLngs[i]);
        const lat = firstIdx >= 0 ? assignmentLats[firstIdx] : fieldLat;
        const lng = firstIdx >= 0 ? assignmentLngs[firstIdx] : fieldLng;

        // Puller notes for the current season. Baserow has no notes_2026 column —
        // seasonal notes live on the 2026 probe_assignment / field_season rows:
        // placement_notes (Fields UI "Notes"), install_notes, removal_notes,
        // field_note, field_season.removal_notes. Also surface permanent probe.notes
        // (used for 7640-style guidance) after seasonal assignment notes.
        const noteParts: string[] = [];
        const pushNote = (label: string, value?: string | null) => {
          const trimmed = (value || '').trim();
          if (!trimmed) return;
          if (noteParts.some((existing) => existing.includes(trimmed) || trimmed.includes(existing.replace(/^[^:]+:\s*/, '')))) return;
          noteParts.push(label ? `${label}: ${trimmed}` : trimmed);
        };
        for (const pa of seasonAssignments) {
          const probeId = pa.probe?.[0]?.id;
          const probe = probeId ? probeMap.get(probeId) : null;
          const serial = probe?.serial_number?.toString() || '';
          const tag = [pa.label, serial].filter(Boolean).join(' · ');
          // Seasonal (2026 assignment) first — placement_notes is the Fields "Notes" col
          pushNote(tag ? `${tag} notes` : 'Notes', pa.placement_notes);
          pushNote(tag ? `${tag} install` : 'Install', pa.install_notes);
          pushNote(tag ? `${tag} removal` : 'Removal', pa.removal_notes);
          pushNote(tag ? `${tag} probe` : 'Probe', probe?.notes);
        }
        pushNote('Season note', fs.field_note);
        pushNote('Season removal', fs.removal_notes);
        pushNote('', fs.notes);
        pushNote('Field', field?.placement_notes);
        pushNote('Directions', field?.field_directions);
        pushNote('Install directions', field?.install_directions);
        pushNote('Field notes', field?.notes);

        return {
          fieldSeasonId: fs.id,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          crop: fs.crop?.value || '',
          brand: brands.join(' · '),
          earlyRemoval: fs.early_removal?.value || '',
          removalDate: fs.removal_date || assignmentDates[0] || '',
          plannedRemover: fs.planned_remover?.value || '',
          needsAtv,
          assignmentIds: seasonAssignments.map((pa) => pa.id),
          assignmentRemovalDates: seasonAssignments.map((pa) => pa.removal_date || ''),
          assignmentLats,
          assignmentLngs,
          assignmentLabels,
          assignmentSerials,
          hybrid: fs.hybrid_variety || '',
          plantingDate: fs.planting_date || '',
          readyToRemove: fs.ready_to_remove?.value === 'Yes',
          maturity: getHybridMaturityLabel(fs.crop?.value || '', fs.hybrid_variety || '')?.label || '',
          lat,
          lng,
          removalPriority: fs.removal_priority?.value || '',
          fieldNotes: noteParts.join('\n\n'),
        };
      })
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName));
    const earlyRemovals = seasonFields.filter((row) => !!row.earlyRemoval);
    const fieldSeasonOptions = selectOptions.field_seasons || {};

    const installedProbes: UninstallProbeData[] = probeAssignments
      .filter((pa) => !!pa.field_season?.[0]?.id)
      .map((pa) => {
        const fieldSeasonId = pa.field_season![0].id;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        const fieldId = fieldSeason?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;
        return {
          assignmentId: pa.id,
          probeId: probeId || 0,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          probeSerial: probe?.serial_number?.toString() || '',
          probeBrand: probe?.brand?.value || '',
          probeLabel: pa.label || '',
          installDate: pa.install_date || '',
          season: fieldSeason?.season || 0,
        };
      })
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    // Build probe → assignments map for RMA (includes season so we can filter current year)
    const probeToAssignments = new Map<number, { id: number; season: number }[]>();
    for (const pa of probeAssignments) {
      const probeId = pa.probe?.[0]?.id;
      if (!probeId) continue;
      const fsId = pa.field_season?.[0]?.id;
      const season = fsId ? (fieldSeasonMap.get(fsId)?.season ?? 0) : 0;
      const existing = probeToAssignments.get(probeId) ?? [];
      existing.push({ id: pa.id, season: Number(season) });
      probeToAssignments.set(probeId, existing);
    }

    const rmaProbes: RmaProbeData[] = probes
      .filter(p => p.serial_number)
      .map(p => ({
        probeId: p.id,
        probeSerial: p.serial_number?.toString() || '',
        probeBrand: p.brand?.value || '',
        assignments: probeToAssignments.get(p.id) ?? [],
      }))
      .sort((a, b) => a.probeSerial.localeCompare(b.probeSerial));

    const brandOptions = Array.from(new Set(probes.map(p => p.brand?.value).filter(Boolean) as string[])).sort();

    const onOrderProbes = probes
      .filter(p => {
        const s = p.status?.value?.toLowerCase() ?? '';
        return s === 'on order' || s === 'on order - trade';
      })
      .map(p => ({
        id: p.id,
        brand: p.brand?.value ?? '',
        status: p.status?.value ?? '',
        notes: p.notes ?? '',
        yearNew: p.year_new ?? null,
      }));

    return {
      earlyRemovals,
      seasonFields,
      earlyRemovalOptions: fieldSeasonOptions.early_removal || [],
      plannedRemoverOptions: fieldSeasonOptions.planned_remover || [],
      installedProbes,
      rmaProbes,
      brandOptions,
      onOrderProbes,
    };
  } catch (error) {
    console.error('Error fetching workflow data:', error);
    return { earlyRemovals: [], seasonFields: [], earlyRemovalOptions: [], plannedRemoverOptions: [], installedProbes: [], rmaProbes: [], brandOptions: [], onOrderProbes: [] };
  }
}

export default async function WorkflowsPage() {
  const { earlyRemovals, seasonFields, earlyRemovalOptions, plannedRemoverOptions, installedProbes, rmaProbes, brandOptions, onOrderProbes } = await getWorkflowData();
  return <WorkflowsClient earlyRemovals={earlyRemovals} seasonFields={seasonFields} earlyRemovalOptions={earlyRemovalOptions} plannedRemoverOptions={plannedRemoverOptions} installedProbes={installedProbes} rmaProbes={rmaProbes} brandOptions={brandOptions} onOrderProbes={onOrderProbes} />;
}
