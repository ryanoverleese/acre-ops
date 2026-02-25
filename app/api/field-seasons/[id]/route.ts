import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { TABLE_IDS, addSpaceVariants } from '@/lib/baserow';

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

    // probe_status, installer, install_* fields are on probe_assignments, not here
    if (body.removal_date !== undefined) updateData.removal_date = body.removal_date;
    if (body.removal_notes !== undefined) updateData.removal_notes = body.removal_notes;
    if (body.crop !== undefined) updateData.crop = body.crop;
    // service_type is a Link field to products_services — needs array of row IDs
    if (body.service_type !== undefined) {
      const stVal = body.service_type;
      updateData.service_type = stVal ? [parseInt(stVal, 10)] : [];
    }
    // antenna_type, battery_type are on probe_assignments, not field_seasons
    if (body.side_dress !== undefined) updateData.side_dress = body.side_dress;
    if (body.logger_id !== undefined) updateData.logger_id = body.logger_id;
    if (body.early_removal !== undefined) updateData.early_removal = body.early_removal;
    if (body.hybrid_variety !== undefined) updateData.hybrid_variety = body.hybrid_variety;
    if (body.ready_to_remove !== undefined) updateData.ready_to_remove = body.ready_to_remove;
    if (body.planting_date !== undefined) updateData.planting_date = body.planting_date;
    // probe link field is on probe_assignments, not field_seasons
    // Install planning fields
    if (body.route_order !== undefined) updateData.route_order = body.route_order;
    if (body.planned_installer !== undefined) updateData.planned_installer = body.planned_installer;
    if (body.ready_to_install !== undefined) updateData.ready_to_install = body.ready_to_install;


    const patchData = addSpaceVariants(updateData);
    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`;
    console.log('PATCH field-season:', fieldSeasonId, 'with data:', JSON.stringify(patchData));

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchData),
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
