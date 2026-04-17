import { NextResponse } from 'next/server';
import { getRows, updateRow, Probe, ProbeRackSlot } from '@/lib/baserow';

export async function POST() {
  try {
    const [probes, slots] = await Promise.all([
      getRows<Probe>('probes'),
      getRows<ProbeRackSlot>('probe_rack'),
    ]);

    // Group probe_rack rows by "rack|slot" key (may be multiple rows per slot for racks 7-13)
    const slotsByKey = new Map<string, ProbeRackSlot[]>();
    for (const slot of slots) {
      const key = `${slot.rack}|${slot.rack_slot}`;
      const existing = slotsByKey.get(key) ?? [];
      existing.push(slot);
      slotsByKey.set(key, existing);
    }

    // Track which slot rows have been assigned (to handle 2-probe slots)
    const assignedSlotRowIds = new Set<number>();

    let assigned = 0;
    let skipped = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const probe of probes) {
      const rackValue = probe.rack?.value;
      const rackSlot = probe.rack_slot;

      if (!rackValue || !rackSlot) {
        skipped++;
        continue;
      }

      const key = `${rackValue}|${rackSlot}`;
      const matchingRows = slotsByKey.get(key);

      if (!matchingRows || matchingRows.length === 0) {
        notFound++;
        errors.push(`No slot found for probe ${probe.serial_number} at ${rackValue}-${rackSlot}`);
        continue;
      }

      // Find the first unassigned slot row for this position
      const targetRow = matchingRows.find(
        (r) => !assignedSlotRowIds.has(r.id) && (r.probe?.length ?? 0) === 0
      );

      if (!targetRow) {
        skipped++;
        errors.push(`All slots at ${rackValue}-${rackSlot} already assigned (probe ${probe.serial_number})`);
        continue;
      }

      try {
        await updateRow('probe_rack', targetRow.id, { probe: [probe.id] });
        assignedSlotRowIds.add(targetRow.id);
        assigned++;
      } catch (e) {
        errors.push(`Failed to assign probe ${probe.serial_number} to ${rackValue}-${rackSlot}: ${e}`);
      }
    }

    return NextResponse.json({ assigned, skipped, notFound, errors });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed', detail: String(error) }, { status: 500 });
  }
}
