import { NextResponse } from 'next/server';
import { getCachedRows, type Probe, type ProbeAssignment } from '@/lib/baserow';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [probes, probeAssignments] = await Promise.all([
      getCachedRows<Probe>('probes', undefined, 60),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
    ]);

    // Probes currently in an active (not installed) assignment
    const activeProbeIds = new Set<number>();
    for (const pa of probeAssignments) {
      const probeId = pa.probe?.[0]?.id;
      const status = (pa.probe_status?.value ?? '').toLowerCase();
      if (probeId && status !== 'installed') {
        activeProbeIds.add(probeId);
      }
    }

    const unassigned = probes
      .filter(p => p.serial_number && !activeProbeIds.has(p.id))
      .map(p => ({
        id: p.id,
        serial: p.serial_number!.toString(),
        brand: p.brand?.value ?? '',
      }))
      .sort((a, b) => a.serial.localeCompare(b.serial));

    return NextResponse.json({ probes: unassigned });
  } catch (error) {
    console.error('unassigned probes error:', error);
    return NextResponse.json({ error: 'Failed to fetch probes' }, { status: 500 });
  }
}
