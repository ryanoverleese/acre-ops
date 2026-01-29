import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getRow, Field, FieldSeason } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

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
      probe_number: body.probe_number || 1,
    };

    // Try to fetch field defaults, but don't fail if we can't
    try {
      const fieldSeason = await getRow<FieldSeason>('field_seasons', body.field_season);
      const fieldId = fieldSeason.field?.[0]?.id;
      if (fieldId) {
        const field = await getRow<Field>('fields', fieldId);
        // Set placement defaults from field if not provided
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

    // Allow explicit overrides
    if (body.placement_lat !== undefined) createData.placement_lat = body.placement_lat;
    if (body.placement_lng !== undefined) createData.placement_lng = body.placement_lng;
    if (body.elevation !== undefined) createData.elevation = body.elevation;
    if (body.soil_type !== undefined) createData.soil_type = body.soil_type;
    if (body.placement_notes !== undefined) createData.placement_notes = body.placement_notes;

    // Optional fields
    if (body.probe) createData.probe = [body.probe];
    if (body.installer) createData.installer = body.installer;
    if (body.install_date) createData.install_date = body.install_date;
    if (body.install_lat !== undefined) createData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) createData.install_lng = body.install_lng;
    if (body.install_notes) createData.install_notes = body.install_notes;
    if (body.cropx_telemetry_id) createData.cropx_telemetry_id = body.cropx_telemetry_id;
    if (body.signal_strength) createData.signal_strength = body.signal_strength;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
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
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating probe assignment:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
