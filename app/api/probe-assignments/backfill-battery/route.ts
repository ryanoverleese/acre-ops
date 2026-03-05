import { NextResponse } from 'next/server';
import { getProbeAssignments, getProbes, TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Backfill: set battery_type to "CropX" on probe assignments where the
// linked probe brand contains "cropx" and battery is not yet set.
// POST /api/probe-assignments/backfill-battery
export async function POST() {
  try {
    const [probeAssignments, probes] = await Promise.all([
      getProbeAssignments(),
      getProbes(),
    ]);

    const probeMap = new Map(probes.map((p) => [p.id, p]));

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const pa of probeAssignments) {
      // Skip if battery already set
      if (pa.battery_type?.value) {
        skipped++;
        continue;
      }

      // Get linked probe
      const probeId = pa.probe?.[0]?.id;
      if (!probeId) { skipped++; continue; }

      const probe = probeMap.get(probeId);
      const brand = (probe?.brand?.value || '').toLowerCase();

      if (!brand.includes('cropx')) {
        skipped++;
        continue;
      }

      const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${pa.id}/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ battery_type: 'CropX' }),
      });

      if (response.ok) {
        updated++;
      } else {
        const errText = await response.text();
        errors.push(`PA ${pa.id}: ${response.status} ${errText}`);
      }
    }

    revalidatePath('/fields');
    return NextResponse.json({
      total: probeAssignments.length,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Battery backfill error:', error);
    return NextResponse.json(
      { error: `Backfill failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
