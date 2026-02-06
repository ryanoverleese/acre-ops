import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Build the update payload - only include fields that were provided
    // Send both underscore and space variants since Baserow field names may use either
    const updateData: Record<string, unknown> = {};
    const setField = (name: string, value: unknown) => {
      updateData[name] = value;
      if (name.includes('_')) {
        updateData[name.replace(/_/g, ' ')] = value;
      }
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.acres !== undefined) updateData.acres = body.acres;
    if (body.lat !== undefined) updateData.lat = body.lat;
    if (body.lng !== undefined) updateData.lng = body.lng;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.elevation !== undefined) updateData.elevation = body.elevation;
    if (body.pivot_acres !== undefined) setField('pivot_acres', body.pivot_acres);
    if (body.water_source !== undefined) setField('water_source', body.water_source);
    if (body.fuel_source !== undefined) setField('fuel_source', body.fuel_source);
    if (body.soil_type !== undefined) setField('soil_type', body.soil_type);
    if (body.placement_notes !== undefined) setField('placement_notes', body.placement_notes);
    if (body.irrigation_type !== undefined) setField('irrigation_type', body.irrigation_type);
    if (body.row_direction !== undefined) setField('row_direction', body.row_direction);
    if (body.nrcs_field !== undefined) setField('nrcs_field', body.nrcs_field);
    if (body.billing_entity !== undefined) {
      const val = body.billing_entity ? [body.billing_entity] : [];
      updateData.billing_entity = val;
      updateData['billing entity'] = val;
    }
    // Drip irrigation fields
    if (body.drip_tubing_direction !== undefined) setField('drip_tubing_direction', body.drip_tubing_direction);
    if (body.drip_tubing_spacing !== undefined) setField('drip_tubing_spacing', body.drip_tubing_spacing);
    if (body.drip_emitter_spacing !== undefined) setField('drip_emitter_spacing', body.drip_emitter_spacing);
    if (body.drip_zones !== undefined) setField('drip_zones', body.drip_zones);
    if (body.drip_gpm !== undefined) setField('drip_gpm', body.drip_gpm);
    if (body.drip_depth !== undefined) setField('drip_depth', body.drip_depth);

    // Make the PATCH request to Baserow
    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/${fieldId}/?user_field_names=true`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      console.error('Update payload was:', JSON.stringify(updateData, null, 2));
      return NextResponse.json(
        { error: `Failed to update field: ${errorText}` },
        { status: response.status }
      );
    }

    const updatedField = await response.json();

    // Bust the Next.js cache so a page refresh picks up the change immediately
    revalidatePath('/fields');

    return NextResponse.json(updatedField);
  } catch (error) {
    console.error('Error updating field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/${fieldId}/?user_field_names=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Field not found' },
        { status: response.status }
      );
    }

    const field = await response.json();

    return NextResponse.json(field);
  } catch (error) {
    console.error('Error fetching field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/${fieldId}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete field' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
