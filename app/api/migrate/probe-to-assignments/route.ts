import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getFieldSeasons, getProbeAssignments } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Add both underscore and space variants so Baserow matches whichever naming it uses
function addSpaceVariants(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (key.includes('_')) {
      result[key.replace(/_/g, ' ')] = value;
    }
  }
  return result;
}

// GET = dry run: show what would be migrated
// POST = execute migration
export async function GET() {
  try {
    const [fieldSeasons, probeAssignments] = await Promise.all([
      getFieldSeasons(),
      getProbeAssignments(),
    ]);

    // Find field_seasons that have a probe assigned
    const fieldSeasonsWithProbe = fieldSeasons.filter((fs) => fs.probe?.[0]?.id);

    // Find which ones already have a probe_assignment with probe_number=1
    const existingProbe1Assignments = new Set<number>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (fsId && pa.probe_number == 1) {
        existingProbe1Assignments.add(fsId);
      }
    });

    const needsMigration = fieldSeasonsWithProbe.filter(
      (fs) => !existingProbe1Assignments.has(fs.id)
    );
    const alreadyMigrated = fieldSeasonsWithProbe.filter(
      (fs) => existingProbe1Assignments.has(fs.id)
    );

    return NextResponse.json({
      summary: {
        totalFieldSeasons: fieldSeasons.length,
        withProbeAssigned: fieldSeasonsWithProbe.length,
        alreadyHaveProbe1Assignment: alreadyMigrated.length,
        needsMigration: needsMigration.length,
      },
      toMigrate: needsMigration.map((fs) => ({
        fieldSeasonId: fs.id,
        season: fs.season,
        probeId: fs.probe?.[0]?.id,
        probeValue: fs.probe?.[0]?.value,
        antennaType: fs.antenna_type?.value,
        batteryType: fs.battery_type?.value,
        probeStatus: fs.probe_status?.value,
      })),
    });
  } catch (error) {
    console.error('Migration dry run error:', error);
    return NextResponse.json({ error: 'Failed to analyze migration' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    const [fieldSeasons, probeAssignments] = await Promise.all([
      getFieldSeasons(),
      getProbeAssignments(),
    ]);

    // Find field_seasons with a probe but no probe_assignment with probe_number=1
    const existingProbe1Assignments = new Set<number>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (fsId && pa.probe_number == 1) {
        existingProbe1Assignments.add(fsId);
      }
    });

    const needsMigration = fieldSeasons.filter(
      (fs) => fs.probe?.[0]?.id && !existingProbe1Assignments.has(fs.id)
    );

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        would_create: needsMigration.length,
        items: needsMigration.map((fs) => ({
          fieldSeasonId: fs.id,
          probeId: fs.probe?.[0]?.id,
          antennaType: fs.antenna_type?.value,
          batteryType: fs.battery_type?.value,
        })),
      });
    }

    // Create probe_assignments in batches of 200
    const batchSize = 200;
    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < needsMigration.length; i += batchSize) {
      const batch = needsMigration.slice(i, i + batchSize);

      const items = batch.map((fs) => {
        const record: Record<string, unknown> = {
          field_season: [fs.id],
          probe_number: 1,
          probe: [fs.probe![0].id],
          probe_status: fs.probe_status?.value || 'Assigned',
        };

        if (fs.antenna_type?.value) record.antenna_type = fs.antenna_type.value;
        if (fs.battery_type?.value) record.battery_type = fs.battery_type.value;

        return addSpaceVariants(record);
      });

      const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/batch/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Migration batch error:', response.status, errorText);
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorText}`);
      } else {
        const result = await response.json();
        created += result.items?.length || 0;
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      created,
      total: needsMigration.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
