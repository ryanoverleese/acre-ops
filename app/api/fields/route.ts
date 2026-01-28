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
    };

    if (body.acres !== undefined) createData.acres = body.acres;
    if (body.pivot_acres !== undefined) createData.pivot_acres = body.pivot_acres;
    if (body.billed_acres !== undefined) createData.billed_acres = body.billed_acres;
    if (body.lat !== undefined) createData.lat = body.lat;
    if (body.lng !== undefined) createData.lng = body.lng;
    if (body.water_source) createData.water_source = body.water_source;
    if (body.fuel_source) createData.fuel_source = body.fuel_source;
    if (body.notes) createData.notes = body.notes;

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
      return NextResponse.json(
        { error: 'Failed to create field in database' },
        { status: fieldResponse.status }
      );
    }

    const newField = await fieldResponse.json();

    // Create the field_seasons record
    const fieldSeasonData: Record<string, unknown> = {
      field: [newField.id], // Link to the new field
      season: body.season || 2026,
      probe_status: 'Unassigned',
    };

    if (body.crop) fieldSeasonData.crop = body.crop;
    if (body.service_type) fieldSeasonData.service_type = body.service_type;
    if (body.antenna_type) fieldSeasonData.antenna_type = body.antenna_type;

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
