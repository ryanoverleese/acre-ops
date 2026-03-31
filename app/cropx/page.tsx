import type { Metadata } from 'next';
import { getOperations, getFields, getFieldSeasons, getProbeAssignments, getProbes, getContacts } from '@/lib/baserow';
import CropXClient from './CropXClient';

export const metadata: Metadata = { title: 'CropX Order Summary' };

export interface CropXFieldRow {
  fieldId: number;
  fieldName: string;
  serviceType: string;
  probeCount: number;
  cropXService: number;
  onOrderV4: number;
  onOrderTradeV4: number;
  onOrderApex: number;
}

export interface CropXSeasonData {
  season: string;
  cropXService: number;
  onOrderV4: number;
  onOrderTradeV4: number;
  onOrderApex: number;
  fields: CropXFieldRow[];
}

export interface CropXOperationRow {
  id: number;
  name: string;
  seasons: CropXSeasonData[];
}

export default async function CropXOrderPage() {
  const [operations, rawFields, fieldSeasons, probeAssignments, probes, contacts] = await Promise.all([
    getOperations(),
    getFields(),
    getFieldSeasons(),
    getProbeAssignments(),
    getProbes(),
    getContacts(),
  ]);

  // Maps for quick lookup
  const probeMap = new Map(probes.map((p) => [p.id, p]));

  // operation → billing entity IDs
  const opToBEIds = new Map<number, Set<number>>();
  contacts.forEach((c) => {
    c.operations?.forEach((op) => {
      if (!opToBEIds.has(op.id)) opToBEIds.set(op.id, new Set());
      c.billing_entity?.forEach((be) => opToBEIds.get(op.id)!.add(be.id));
    });
  });

  // billing entity → fields
  const beToFields = new Map<number, typeof rawFields>();
  rawFields.forEach((f) => {
    const beId = f.billing_entity?.[0]?.id;
    if (beId) {
      if (!beToFields.has(beId)) beToFields.set(beId, []);
      beToFields.get(beId)!.push(f);
    }
  });

  // field → field seasons
  const fieldToFS = new Map<number, typeof fieldSeasons>();
  fieldSeasons.forEach((fs) => {
    const fId = fs.field?.[0]?.id;
    if (fId) {
      if (!fieldToFS.has(fId)) fieldToFS.set(fId, []);
      fieldToFS.get(fId)!.push(fs);
    }
  });

  // field season → probe assignments
  const fsToPA = new Map<number, typeof probeAssignments>();
  probeAssignments.forEach((pa) => {
    const fsId = pa.field_season?.[0]?.id;
    if (fsId) {
      if (!fsToPA.has(fsId)) fsToPA.set(fsId, []);
      fsToPA.get(fsId)!.push(pa);
    }
  });

  // All seasons present in data, newest first
  const allSeasons = [...new Set(fieldSeasons.map((fs) => String(fs.season)).filter(Boolean))]
    .sort()
    .reverse();

  const opRows: CropXOperationRow[] = [];

  for (const op of operations) {
    const beIds = opToBEIds.get(op.id) ?? new Set<number>();
    const opFields: typeof rawFields = [];
    beIds.forEach((beId) => opFields.push(...(beToFields.get(beId) ?? [])));

    const seasons: CropXSeasonData[] = [];

    for (const season of allSeasons) {
      let totalCropX = 0, totalOnOrderV4 = 0, totalOnOrderTradeV4 = 0, totalOnOrderApex = 0;
      const fieldRows: CropXFieldRow[] = [];

      for (const field of opFields) {
        const fss = (fieldToFS.get(field.id) ?? []).filter((fs) => String(fs.season) === season);
        if (fss.length === 0) continue;

        let fieldCropX = 0, fieldOnOrderV4 = 0, fieldOnOrderTradeV4 = 0, fieldOnOrderApex = 0, fieldProbeCount = 0;

        for (const fs of fss) {
          const serviceType = fs.service_type?.[0]?.value ?? '';
          const isCropX = serviceType.toLowerCase().includes('cropx');
          const pas = fsToPA.get(fs.id) ?? [];

          for (const pa of pas) {
            const probeId = pa.probe?.[0]?.id;
            const probe = probeId ? probeMap.get(probeId) : undefined;
            const status = (probe?.status?.value ?? '').toLowerCase();
            const brand = (probe?.brand?.value ?? '').toLowerCase();
            const isApex = brand.includes('apex');

            fieldProbeCount++;
            const isOnOrder = status.includes('on order') || status.includes('trade');
            if (isCropX && !isOnOrder) fieldCropX++;
            if (status.includes('on order') && !status.includes('trade')) {
              if (isApex) fieldOnOrderApex++;
              else fieldOnOrderV4++;
            }
            if (status.includes('trade')) fieldOnOrderTradeV4++;
          }

          // If field has CropX service but no probe assignments yet, still count service type
          if (isCropX && pas.length === 0) {
            // no probes placed yet — skip for now
          }
        }

        if (fieldProbeCount > 0) {
          totalCropX += fieldCropX;
          totalOnOrderV4 += fieldOnOrderV4;
          totalOnOrderTradeV4 += fieldOnOrderTradeV4;
          totalOnOrderApex += fieldOnOrderApex;

          const serviceType = fss[0].service_type?.[0]?.value ?? '';
          fieldRows.push({
            fieldId: field.id,
            fieldName: field.name,
            serviceType,
            probeCount: fieldProbeCount,
            cropXService: fieldCropX,
            onOrderV4: fieldOnOrderV4,
            onOrderTradeV4: fieldOnOrderTradeV4,
            onOrderApex: fieldOnOrderApex,
          });
        }
      }

      if (fieldRows.length > 0) {
        seasons.push({
          season,
          cropXService: totalCropX,
          onOrderV4: totalOnOrderV4,
          onOrderTradeV4: totalOnOrderTradeV4,
          onOrderApex: totalOnOrderApex,
          fields: fieldRows.sort((a, b) => a.fieldName.localeCompare(b.fieldName)),
        });
      }
    }

    if (seasons.length > 0) {
      opRows.push({ id: op.id, name: op.name, seasons });
    }
  }

  opRows.sort((a, b) => a.name.localeCompare(b.name));

  return <CropXClient operations={opRows} allSeasons={allSeasons} />;
}
