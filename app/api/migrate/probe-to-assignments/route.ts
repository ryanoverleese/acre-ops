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

// Extract a plain string from a value that might be a link row field (array/object) or plain string
function toPlainString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) {
    return value[0].value ?? String(value[0]);
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value);
}

// Convert a date value to YYYY-MM-DD format for Baserow
function toBaserowDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const str = typeof value === 'string' ? value : String(value);
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Parse and reformat
  const date = new Date(str);
  if (isNaN(date.getTime())) return undefined;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Map legacy antenna_type values to current select options
const ANTENNA_TYPE_MAP: Record<string, string> = {
  "10' CropX Antenna": 'CropX 10\'',
  "10' Sentek Antenna": 'Sentek 10\'',
  "6' CropX Antenna": 'CropX 6\'',
  'CropX Stub - White Flag': 'CropX Stub',
  'Stub CropX Antenna': 'CropX Stub',
  'Stub Sentek Antenna': 'Sentek Stub',
};

function mapAntennaType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return ANTENNA_TYPE_MAP[value] ?? value;
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

    // Support ?batch=N query param to process in chunks of 50 (1-indexed)
    const PAGE_SIZE = 50;
    const batchParam = request.nextUrl.searchParams.get('batch');
    const batchNum = batchParam ? parseInt(batchParam, 10) : null;

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

    const allNeedsMigration = fieldSeasons.filter(
      (fs) => fs.probe?.[0]?.id && !existingProbe1Map.has(fs.id)
    );

    // Also find probe_assignments that need install data synced from field_seasons
    const allNeedsInstallSync = fieldSeasons.filter((fs) => {
      if (!fs.probe?.[0]?.id) return false;
      const pa = existingProbe1Map.get(fs.id);
      if (!pa) return false;
      return fs.installer && !pa.installer;
    });

    // Slice to the requested batch (or process all if no batch param)
    const totalCreateBatches = Math.ceil(allNeedsMigration.length / PAGE_SIZE) || 0;
    const totalSyncBatches = Math.ceil(allNeedsInstallSync.length / PAGE_SIZE) || 0;
    const totalBatches = Math.max(totalCreateBatches, totalSyncBatches);

    let needsMigration = allNeedsMigration;
    let needsInstallSync = allNeedsInstallSync;

    if (batchNum !== null) {
      if (batchNum < 1 || batchNum > totalBatches) {
        return NextResponse.json({
          error: `Invalid batch number. Must be 1-${totalBatches}`,
          totalRecords: allNeedsMigration.length,
          totalSyncRecords: allNeedsInstallSync.length,
          totalBatches,
          pageSize: PAGE_SIZE,
        }, { status: 400 });
      }
      const start = (batchNum - 1) * PAGE_SIZE;
      needsMigration = allNeedsMigration.slice(start, start + PAGE_SIZE);
      needsInstallSync = allNeedsInstallSync.slice(start, start + PAGE_SIZE);
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        batch: batchNum,
        totalBatches,
        pageSize: PAGE_SIZE,
        would_create: needsMigration.length,
        would_create_total: allNeedsMigration.length,
        would_sync_install_data: needsInstallSync.length,
        would_sync_total: allNeedsInstallSync.length,
        items: needsMigration.map((fs) => ({
          fieldSeasonId: fs.id,
          probeId: fs.probe?.[0]?.id,
          installer: fs.installer,
          installDate: fs.install_date,
        })),
      });
    }

    // Phase 1: Create new probe_assignments (includes ALL data)
    let created = 0;
    const errors: string[] = [];

    if (needsMigration.length > 0) {
      const items = needsMigration.map((fs) => {
        const record: Record<string, unknown> = {
          field_season: [fs.id],
          probe_number: 1,
          probe: [fs.probe![0].id],
          probe_status: fs.probe_status?.value || 'Assigned',
        };

        const mappedAntenna = mapAntennaType(fs.antenna_type?.value);
        if (mappedAntenna) record.antenna_type = mappedAntenna;
        if (fs.battery_type?.value) record.battery_type = fs.battery_type.value;
        // Copy ALL install data - installer must be plain string, dates must be YYYY-MM-DD
        const installerStr = toPlainString(fs.installer);
        if (installerStr) record.installer = installerStr;
        const installDateStr = toBaserowDate(fs.install_date);
        if (installDateStr) record.install_date = installDateStr;
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
        errors.push(`Create batch: ${errorText}`);
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

      const installerStr = toPlainString(fs.installer);
      if (installerStr) updateData.installer = installerStr;
      const installDateStr = toBaserowDate(fs.install_date);
      if (installDateStr) updateData.install_date = installDateStr;
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
      batch: batchNum,
      totalBatches,
      pageSize: PAGE_SIZE,
      created,
      synced,
      totalCreateRemaining: allNeedsMigration.length - (batchNum ? batchNum * PAGE_SIZE : allNeedsMigration.length),
      totalSyncRemaining: allNeedsInstallSync.length - (batchNum ? batchNum * PAGE_SIZE : allNeedsInstallSync.length),
      errors: errors.length > 0 ? errors : undefined,
    }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
