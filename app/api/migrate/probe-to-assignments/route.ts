import { NextResponse } from 'next/server';

// Migration complete: all probe data now lives in probe_assignments table.
// The legacy probe columns (probe, probe_status, antenna_type, battery_type,
// installer, install_date, install_lat, install_lng, install_photo_field_end_url,
// install_photo_extra_url, install_notes, cropx_telemetry_id, signal_strength)
// have been removed from the field_seasons table in Baserow.

export async function GET() {
  return NextResponse.json({
    status: 'complete',
    message: 'Migration is complete. All probe data now lives in the probe_assignments table. Legacy probe columns have been removed from field_seasons.',
  });
}

export async function POST() {
  return NextResponse.json({
    status: 'complete',
    message: 'Migration is complete. Nothing to migrate.',
  });
}
