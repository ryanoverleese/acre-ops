import { NextResponse } from 'next/server';
import { getProbeAssignments, getFieldSeasons, getFields, TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// One-time backfill: copy elevation + soil_type from fields to probe_assignments
// that are missing these values.
// POST /api/probe-assignments/backfill
export async function POST() {
  try {
    const [probeAssignments, fieldSeasons, fields] = await Promise.all([
      getProbeAssignments(),
      getFieldSeasons(),
      getFields(),
    ]);

    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const pa of probeAssignments) {
      const hasElevation = pa.elevation !== undefined && pa.elevation !== null && pa.elevation !== '';
      const hasSoilType = pa.soil_type !== undefined && pa.soil_type !== null && pa.soil_type !== '';

      if (hasElevation && hasSoilType) {
        skipped++;
        continue;
      }

      // Look up parent field
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) { skipped++; continue; }

      const fs = fieldSeasonMap.get(fsId);
      const fieldId = fs?.field?.[0]?.id;
      if (!fieldId) { skipped++; continue; }

      const field = fieldMap.get(fieldId);
      if (!field) { skipped++; continue; }

      const fieldElevation = typeof field.elevation === 'object'
        ? (field.elevation as { value: string })?.value
        : field.elevation;
      const fieldSoilType = typeof field.soil_type === 'object'
        ? (field.soil_type as { value: string })?.value
        : field.soil_type;

      // Build update payload only for missing fields
      const updateData: Record<string, unknown> = {};
      if (!hasElevation && fieldElevation) {
        updateData['elevation'] = fieldElevation;
      }
      if (!hasSoilType && fieldSoilType) {
        updateData['soil_type'] = fieldSoilType;
        updateData['soil type'] = fieldSoilType;
      }

      if (Object.keys(updateData).length === 0) {
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
        body: JSON.stringify(updateData),
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
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: `Backfill failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
