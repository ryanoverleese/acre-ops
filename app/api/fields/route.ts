import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Field name is required' },
        { status: 400 }
      );
    }
    if (!body.billing_entity) {
      return NextResponse.json(
        { error: 'Billing entity is required' },
        { status: 400 }
      );
    }

    // Build the field create payload
    const createData: Record<string, unknown> = {
      name: body.name,
      billing_entity: [body.billing_entity], // Link field format
      'billing entity': [body.billing_entity],
    };

    // Only add optional fields if they have valid values
    // Note: Only adding basic fields that work with Baserow
    // Select fields (water_source, fuel_source) can be edited after creation
    if (body.acres !== undefined && body.acres !== null && body.acres !== '') {
      createData.acres = Number(body.acres);
    }
    if (body.pivot_acres !== undefined && body.pivot_acres !== null && body.pivot_acres !== '') {
      createData.pivot_acres = Number(body.pivot_acres);
      createData['pivot acres'] = Number(body.pivot_acres);
    }
    if (body.lat !== undefined && body.lat !== null && body.lat !== '') {
      // Round to 6 decimal places (Baserow limit)
      createData.lat = Math.round(Number(body.lat) * 1000000) / 1000000;
    }
    if (body.lng !== undefined && body.lng !== null && body.lng !== '') {
      // Round to 6 decimal places (Baserow limit)
      createData.lng = Math.round(Number(body.lng) * 1000000) / 1000000;
    }
    if (body.notes && body.notes.trim() !== '') {
      createData.notes = body.notes;
    }
    if (body.irrigation_type) {
      createData.irrigation_type = body.irrigation_type;
      createData['irrigation type'] = body.irrigation_type;
    }
    if (body.row_direction) {
      createData.row_direction = body.row_direction;
      createData['row direction'] = body.row_direction;
    }
    // Skip water_source and fuel_source on create - they can be edited after

    console.log('Creating field with data:', JSON.stringify(createData, null, 2));

    // Create the field
    const fieldUrl = `${BASEROW_API_URL}/${TABLE_IDS.fields}/?user_field_names=true`;
    const fieldResponse = await fetch(fieldUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!fieldResponse.ok) {
      const errorText = await fieldResponse.text();
      console.error('Baserow API error creating field:', fieldResponse.status, errorText);
      let errorDetail = 'Failed to create field in database';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error || errorJson.detail || JSON.stringify(errorJson);
      } catch {
        errorDetail = errorText || errorDetail;
      }
      return NextResponse.json(
        { error: errorDetail },
        { status: fieldResponse.status }
      );
    }

    const newField = await fieldResponse.json();

    // Create the field_seasons record
    const fieldSeasonData: Record<string, unknown> = {
      field: [newField.id], // Link to the new field
      season: parseInt(body.season, 10) || 2026,
      probe_status: 'Unassigned',
    };

    if (body.crop) fieldSeasonData.crop = body.crop;
    if (body.service_type) fieldSeasonData.service_type = body.service_type;
    if (body.antenna_type) fieldSeasonData.antenna_type = body.antenna_type;
    if (body.battery_type) fieldSeasonData.battery_type = body.battery_type;
    if (body.side_dress) fieldSeasonData.side_dress = body.side_dress;
    if (body.logger_id) fieldSeasonData.logger_id = body.logger_id;
    if (body.early_removal) fieldSeasonData.early_removal = body.early_removal;
    if (body.hybrid_variety) fieldSeasonData.hybrid_variety = body.hybrid_variety;
    if (body.ready_to_remove) fieldSeasonData.ready_to_remove = body.ready_to_remove;
    if (body.planting_date) fieldSeasonData.planting_date = body.planting_date;

    const fieldSeasonUrl = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/?user_field_names=true`;
    const fieldSeasonResponse = await fetch(fieldSeasonUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fieldSeasonData),
    });

    if (!fieldSeasonResponse.ok) {
      const errorText = await fieldSeasonResponse.text();
      console.error('Baserow API error creating field_season:', fieldSeasonResponse.status, errorText);
      // Field was created but field_season failed - still return success with warning
      return NextResponse.json({
        ...newField,
        warning: 'Field created but field_season creation failed',
      }, { status: 201 });
    }

    const newFieldSeason = await fieldSeasonResponse.json();

    return NextResponse.json({
      field: newField,
      fieldSeason: newFieldSeason,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
