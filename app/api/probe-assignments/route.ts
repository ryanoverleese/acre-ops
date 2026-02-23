import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { TABLE_IDS, getRow, Field, FieldSeason } from '@/lib/baserow';
import { fetchElevation, fetchSoilType } from '@/lib/geo';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.field_season) {
      return NextResponse.json(
        { error: 'Field season ID is required' },
        { status: 400 }
      );
    }

    // Start with minimal required data
    const createData: Record<string, unknown> = {
      field_season: [body.field_season],
      probe_number: body.probe_number ?? 1,
    };

    console.log('Creating probe assignment with probe_number:', body.probe_number, '->', createData.probe_number);

    // Try to fetch field defaults for placement data
    try {
      const fieldSeason = await getRow<FieldSeason>('field_seasons', body.field_season);
      const fieldId = fieldSeason.field?.[0]?.id;
      if (fieldId) {
        const field = await getRow<Field>('fields', fieldId);
        // Set placement defaults from field if not explicitly provided
        if (body.placement_lat === undefined && field.lat) createData.placement_lat = field.lat;
        if (body.placement_lng === undefined && field.lng) createData.placement_lng = field.lng;
        if (body.elevation === undefined && field.elevation) {
          createData.elevation = typeof field.elevation === 'object' ? field.elevation?.value : field.elevation;
        }
        if (body.soil_type === undefined && field.soil_type) {
          createData.soil_type = typeof field.soil_type === 'object' ? field.soil_type?.value : field.soil_type;
        }
        if (body.placement_notes === undefined && field.placement_notes) {
          createData.placement_notes = field.placement_notes;
        }
      }
    } catch (fetchError) {
      console.log('Could not fetch field defaults (continuing anyway):', fetchError);
    }

    // Allow explicit overrides for placement fields
    if (body.placement_lat !== undefined) createData.placement_lat = body.placement_lat;
    if (body.placement_lng !== undefined) createData.placement_lng = body.placement_lng;
    if (body.elevation !== undefined) createData.elevation = body.elevation;
    if (body.soil_type !== undefined) createData.soil_type = body.soil_type;
    if (body.placement_notes !== undefined) createData.placement_notes = body.placement_notes;

    // Auto-fetch elevation/soil from external APIs if we have coords but missing data
    const hasCoords = createData.placement_lat && createData.placement_lng;
    if (hasCoords) {
      const lat = Number(createData.placement_lat);
      const lng = Number(createData.placement_lng);
      const [elev, soil] = await Promise.all([
        !createData.elevation ? fetchElevation(lat, lng) : Promise.resolve(null),
        !createData.soil_type ? fetchSoilType(lat, lng) : Promise.resolve(null),
      ]);
      if (elev && !createData.elevation) createData.elevation = elev;
      if (soil && !createData.soil_type) createData.soil_type = soil;
    }

    // Other optional fields
    if (body.probe) createData.probe = [body.probe];
    if (body.antenna_type) createData.antenna_type = body.antenna_type;
    if (body.battery_type) createData.battery_type = body.battery_type;
    if (body.installer) createData.installer = body.installer;
    if (body.install_date) createData.install_date = body.install_date;
    if (body.install_lat !== undefined) createData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) createData.install_lng = body.install_lng;
    if (body.install_notes) createData.install_notes = body.install_notes;
    if (body.cropx_telemetry_id) createData.cropx_telemetry_id = body.cropx_telemetry_id;
    if (body.signal_strength) createData.signal_strength = body.signal_strength;

    // Send both underscore and space variants for Baserow field name compatibility
    const postData = addSpaceVariants(createData);

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/?user_field_names=true`;
    console.log('POST probe-assignment data:', JSON.stringify(postData));
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Failed to create probe assignment: ${errorText}` },
        { status: response.status }
      );
    }

    const created = await response.json();
    console.log('Created probe assignment:', created.id, 'probe_number:', created.probe_number ?? created['probe number']);
    revalidatePath('/fields');
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating probe assignment:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
