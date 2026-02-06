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

    if (body.probe_status !== undefined) setField('probe_status', body.probe_status);
    if (body.install_date !== undefined) setField('install_date', body.install_date);
    if (body.install_lat !== undefined) setField('install_lat', body.install_lat);
    if (body.install_lng !== undefined) setField('install_lng', body.install_lng);
    if (body.installer !== undefined) setField('installer', body.installer);
    if (body.install_notes !== undefined) setField('install_notes', body.install_notes);
    if (body.removal_date !== undefined) setField('removal_date', body.removal_date);
    if (body.removal_notes !== undefined) setField('removal_notes', body.removal_notes);
    if (body.crop !== undefined) setField('crop', body.crop);
    if (body.service_type !== undefined) setField('service_type', body.service_type);
    if (body.antenna_type !== undefined) setField('antenna_type', body.antenna_type);
    if (body.battery_type !== undefined) setField('battery_type', body.battery_type);
    if (body.side_dress !== undefined) setField('side_dress', body.side_dress);
    if (body.logger_id !== undefined) setField('logger_id', body.logger_id);
    if (body.early_removal !== undefined) setField('early_removal', body.early_removal);
    if (body.hybrid_variety !== undefined) setField('hybrid_variety', body.hybrid_variety);
    if (body.ready_to_remove !== undefined) setField('ready_to_remove', body.ready_to_remove);
    if (body.planting_date !== undefined) setField('planting_date', body.planting_date);
    // Only update probe links when explicitly provided with a numeric ID or 0/empty to clear
    if (body.probe !== undefined && body.probe !== null) {
      setField('probe', body.probe ? [body.probe] : []);
    }
    // Note: probe_2 is stored in the probe_assignments table, not on field_seasons
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
