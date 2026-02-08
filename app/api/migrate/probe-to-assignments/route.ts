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
    const existingProbe1Assignments = new Map<number, typeof probeAssignments[0]>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (fsId && pa.probe_number == 1) {
        existingProbe1Assignments.set(fsId, pa);
      }
    });

    const needsMigration = fieldSeasonsWithProbe.filter(
      (fs) => !existingProbe1Assignments.has(fs.id)
    );
    const alreadyMigrated = fieldSeasonsWithProbe.filter(
      (fs) => existingProbe1Assignments.has(fs.id)
    );

    // Check which already-migrated ones are missing install data
    const needsInstallDataSync = alreadyMigrated.filter((fs) => {
      const pa = existingProbe1Assignments.get(fs.id)!;
      // If field_season has install data but probe_assignment doesn't, needs sync
      return fs.installer && !pa.installer;
    });

    return NextResponse.json({
      summary: {
        totalFieldSeasons: fieldSeasons.length,
        withProbeAssigned: fieldSeasonsWithProbe.length,
        alreadyHaveProbe1Assignment: alreadyMigrated.length,
        needsMigration: needsMigration.length,
        needsInstallDataSync: needsInstallDataSync.length,
      },
      toMigrate: needsMigration.map((fs) => ({
        fieldSeasonId: fs.id,
        season: fs.season,
        probeId: fs.probe?.[0]?.id,
        probeValue: fs.probe?.[0]?.value,
        antennaType: fs.antenna_type?.value,
        batteryType: fs.battery_type?.value,
        probeStatus: fs.probe_status?.value,
        installer: fs.installer,
        installDate: fs.install_date,
      })),
      toSyncInstallData: needsInstallDataSync.map((fs) => ({
        fieldSeasonId: fs.id,
        probeAssignmentId: existingProbe1Assignments.get(fs.id)!.id,
        installer: fs.installer,
        installDate: fs.install_date,
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
    const existingProbe1Map = new Map<number, typeof probeAssignments[0]>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (fsId && pa.probe_number == 1) {
        existingProbe1Map.set(fsId, pa);
      }
    });

    const needsMigration = fieldSeasons.filter(
      (fs) => fs.probe?.[0]?.id && !existingProbe1Map.has(fs.id)
    );

    // Also find probe_assignments that need install data synced from field_seasons
    const needsInstallSync = fieldSeasons.filter((fs) => {
      if (!fs.probe?.[0]?.id) return false;
      const pa = existingProbe1Map.get(fs.id);
      if (!pa) return false;
      // Sync if field_season has install data but probe_assignment doesn't
      return fs.installer && !pa.installer;
    });

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        would_create: needsMigration.length,
        would_sync_install_data: needsInstallSync.length,
        items: needsMigration.map((fs) => ({
          fieldSeasonId: fs.id,
          probeId: fs.probe?.[0]?.id,
          installer: fs.installer,
          installDate: fs.install_date,
        })),
      });
    }

    // Phase 1: Create new probe_assignments (includes ALL data)
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
        // Copy ALL install data
        if (fs.installer) record.installer = fs.installer;
        if (fs.install_date) record.install_date = fs.install_date;
        if (fs.install_lat) record.install_lat = fs.install_lat;
        if (fs.install_lng) record.install_lng = fs.install_lng;
        if (fs.install_notes) record.install_notes = fs.install_notes;
        if (fs.cropx_telemetry_id) record.cropx_telemetry_id = fs.cropx_telemetry_id;
        if (fs.signal_strength) record.signal_strength = fs.signal_strength;
        // Photos are file fields - they need special handling (link references)
        if (fs.install_photo_field_end_url?.length) {
          record.install_photo_field_end_url = fs.install_photo_field_end_url;
        }
        if (fs.install_photo_extra_url?.length) {
          record.install_photo_extra_url = fs.install_photo_extra_url;
        }

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
        errors.push(`Create batch ${Math.floor(i / batchSize) + 1}: ${errorText}`);
      } else {
        const result = await response.json();
        created += result.items?.length || 0;
      }
    }

    // Phase 2: Sync install data to existing probe_assignments that are missing it
    let synced = 0;
    for (const fs of needsInstallSync) {
      const pa = existingProbe1Map.get(fs.id)!;
      const updateData: Record<string, unknown> = {};

      if (fs.installer) updateData.installer = fs.installer;
      if (fs.install_date) updateData.install_date = fs.install_date;
      if (fs.install_lat) updateData.install_lat = fs.install_lat;
      if (fs.install_lng) updateData.install_lng = fs.install_lng;
      if (fs.install_notes) updateData.install_notes = fs.install_notes;
      if (fs.cropx_telemetry_id) updateData.cropx_telemetry_id = fs.cropx_telemetry_id;
      if (fs.signal_strength) updateData.signal_strength = fs.signal_strength;
      if (fs.install_photo_field_end_url?.length) {
        updateData.install_photo_field_end_url = fs.install_photo_field_end_url;
      }
      if (fs.install_photo_extra_url?.length) {
        updateData.install_photo_extra_url = fs.install_photo_extra_url;
      }

      const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${pa.id}/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addSpaceVariants(updateData)),
      });

      if (response.ok) {
        synced++;
      } else {
        const errorText = await response.text();
        errors.push(`Sync PA ${pa.id}: ${errorText}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      created,
      synced,
      total: needsMigration.length,
      totalToSync: needsInstallSync.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
