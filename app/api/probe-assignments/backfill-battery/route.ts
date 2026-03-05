import { NextResponse } from 'next/server';
import { getProbeAssignments, getProbes, getFieldSeasons, TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TARGET_SEASON = 2026;

// Backfill: set battery_type to "CropX" on 2026 probe assignments where the
// linked probe brand contains "cropx" and battery is not yet set.
// Uses batch PATCH for speed (200 per request).
// POST /api/probe-assignments/backfill-battery
export async function POST() {
  try {
    const [probeAssignments, probes, fieldSeasons] = await Promise.all([
      getProbeAssignments(),
      getProbes(),
      getFieldSeasons(),
    ]);

    const probeMap = new Map(probes.map((p) => [p.id, p]));

    // Build set of field_season IDs for the target season
    const targetFieldSeasonIds = new Set(
      fieldSeasons
        .filter((fs) => {
          const season = typeof fs.season === 'string' ? parseInt(fs.season, 10) : fs.season;
          return season == TARGET_SEASON;
        })
        .map((fs) => fs.id)
    );

    // Collect IDs that need updating
    const toUpdate: number[] = [];
    let skipped = 0;

    for (const pa of probeAssignments) {
      // Only process probe assignments linked to target season
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId || !targetFieldSeasonIds.has(fsId)) { skipped++; continue; }

      if (pa.battery_type?.value) { skipped++; continue; }

      const probeId = pa.probe?.[0]?.id;
      if (!probeId) { skipped++; continue; }

      const probe = probeMap.get(probeId);
      const brand = (probe?.brand?.value || '').toLowerCase();

      if (!brand.includes('cropx')) { skipped++; continue; }

      toUpdate.push(pa.id);
    }

    // Batch update in groups of 200
    let updated = 0;
    const errors: string[] = [];
    const batchSize = 200;

    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);
      const items = batch.map((id) => ({
        id,
        battery_type: 'CropX',
      }));

      const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/batch/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const result = await response.json();
        updated += result.items?.length || batch.length;
      } else {
        const errText = await response.text();
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${response.status} ${errText}`);
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
