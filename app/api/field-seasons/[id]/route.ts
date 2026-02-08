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
    const fieldSeasonId = parseInt(id, 10);

    if (isNaN(fieldSeasonId)) {
      return NextResponse.json(
        { error: 'Invalid field season ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Helper: set a field with both underscore and space variants
    // so Baserow matches whichever naming convention the field uses
    const setField = (key: string, value: unknown) => {
      updateData[key] = value;
      if (key.includes('_')) {
        updateData[key.replace(/_/g, ' ')] = value;
      }
    };

    // probe_status, installer, install_* fields are on probe_assignments, not here
    if (body.removal_date !== undefined) setField('removal_date', body.removal_date);
    if (body.removal_notes !== undefined) setField('removal_notes', body.removal_notes);
    if (body.crop !== undefined) setField('crop', body.crop);
    // service_type is a Link field to products_services — needs array of row IDs
    if (body.service_type !== undefined) {
      const stVal = body.service_type;
      setField('service_type', stVal ? [parseInt(stVal, 10)] : []);
    }
    // antenna_type, battery_type are on probe_assignments, not field_seasons
    if (body.side_dress !== undefined) setField('side_dress', body.side_dress);
    if (body.logger_id !== undefined) setField('logger_id', body.logger_id);
    if (body.early_removal !== undefined) setField('early_removal', body.early_removal);
    if (body.hybrid_variety !== undefined) setField('hybrid_variety', body.hybrid_variety);
    if (body.ready_to_remove !== undefined) setField('ready_to_remove', body.ready_to_remove);
    if (body.planting_date !== undefined) setField('planting_date', body.planting_date);
    // probe link field is on probe_assignments, not field_seasons
    // Install planning fields
    if (body.route_order !== undefined) setField('route_order', body.route_order);
    if (body.planned_installer !== undefined) setField('planned_installer', body.planned_installer);
    if (body.ready_to_install !== undefined) setField('ready_to_install', body.ready_to_install);
    // Approval
    if (body.approval_status !== undefined) setField('approval_status', body.approval_status);

    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`;
    console.log('PATCH field-season:', fieldSeasonId, 'with data:', JSON.stringify(updateData));

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
      return NextResponse.json(
        { error: 'Failed to update field season', status: response.status, details: errorText },
        { status: response.status }
      );
    }

    const updated = await response.json();

    revalidatePath('/fields');
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating field season:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldSeasonId = parseInt(id, 10);

    if (isNaN(fieldSeasonId)) {
      return NextResponse.json(
        { error: 'Invalid field season ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/`;
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
        { error: 'Failed to delete field season' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting field season:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
