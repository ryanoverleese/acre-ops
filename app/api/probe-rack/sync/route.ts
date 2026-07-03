import { NextResponse } from 'next/server';
import { getRows, Probe, ProbeRackSlot, TABLE_IDS, bustTableCache } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST() {
  try {
    const [probes, slots] = await Promise.all([
      getRows<Probe>('probes'),
      getRows<ProbeRackSlot>('probe_rack'),
    ]);

    // Group probe_rack rows by "rack|slot" — multiple rows per slot for racks 7-13
    const slotsByKey = new Map<string, ProbeRackSlot[]>();
    for (const slot of slots) {
      const key = `${slot.rack}|${slot.rack_slot}`;
      const existing = slotsByKey.get(key) ?? [];
      existing.push(slot);
      slotsByKey.set(key, existing);
    }

    const assignedSlotRowIds = new Set<number>();
    const updates: { id: number; probe: number[] }[] = [];
    let skipped = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const probe of probes) {
      const rackValue = probe.rack?.value;
      const rackSlot = probe.rack_slot;

      if (!rackValue || !rackSlot) { skipped++; continue; }

      const key = `${rackValue}|${rackSlot}`;
      const matchingRows = slotsByKey.get(key);

      if (!matchingRows?.length) {
        notFound++;
        errors.push(`No slot for probe ${probe.serial_number} at ${rackValue}-${rackSlot}`);
        continue;
      }

      const targetRow = matchingRows.find(
        (r) => !assignedSlotRowIds.has(r.id) && (r.probe?.length ?? 0) === 0
      );

      if (!targetRow) {
        skipped++;
        errors.push(`All slots at ${rackValue}-${rackSlot} already assigned (probe ${probe.serial_number})`);
        continue;
      }

      assignedSlotRowIds.add(targetRow.id);
      updates.push({ id: targetRow.id, probe: [probe.id] });
    }

    if (updates.length === 0) {
      return NextResponse.json({ assigned: 0, skipped, notFound, errors });
    }

    // Batch update in chunks of 200 (Baserow limit)
    const chunkSize = 200;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      const batchRes = await fetch(
        `${BASEROW_API_URL}/${TABLE_IDS.probe_rack}/batch/?user_field_names=true`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Token ${BASEROW_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: chunk }),
        }
      );

      if (!batchRes.ok) {
        const detail = await batchRes.text();
        if (i > 0) bustTableCache('probe_rack'); // earlier chunks already wrote
        return NextResponse.json({ error: 'Batch update failed', detail }, { status: 500 });
      }
    }

    bustTableCache('probe_rack');
    return NextResponse.json({ assigned: updates.length, skipped, notFound, errors });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed', detail: String(error) }, { status: 500 });
  }
}
