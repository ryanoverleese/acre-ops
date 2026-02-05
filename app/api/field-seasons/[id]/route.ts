import { NextRequest, NextResponse } from 'next/server';
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

    if (body.probe_status !== undefined) updateData.probe_status = body.probe_status;
    if (body.install_date !== undefined) updateData.install_date = body.install_date;
    if (body.install_lat !== undefined) updateData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) updateData.install_lng = body.install_lng;
    if (body.installer !== undefined) updateData.installer = body.installer;
    if (body.install_notes !== undefined) updateData.install_notes = body.install_notes;
    if (body.removal_date !== undefined) updateData.removal_date = body.removal_date;
    if (body.removal_notes !== undefined) updateData.removal_notes = body.removal_notes;
    if (body.crop !== undefined) updateData.crop = body.crop;
    if (body.service_type !== undefined) updateData.service_type = body.service_type;
    if (body.antenna_type !== undefined) updateData.antenna_type = body.antenna_type;
    if (body.battery_type !== undefined) updateData.battery_type = body.battery_type;
    if (body.side_dress !== undefined) updateData.side_dress = body.side_dress;
    if (body.logger_id !== undefined) updateData.logger_id = body.logger_id;
    if (body.early_removal !== undefined) updateData.early_removal = body.early_removal;
    if (body.hybrid_variety !== undefined) updateData.hybrid_variety = body.hybrid_variety;
    if (body.ready_to_remove !== undefined) updateData.ready_to_remove = body.ready_to_remove;
    if (body.planting_date !== undefined) updateData.planting_date = body.planting_date;
    if (body.probe !== undefined) {
      updateData.probe = body.probe ? [body.probe] : [];
    }
    if (body.probe_2 !== undefined) {
      updateData.probe_2 = body.probe_2 ? [body.probe_2] : [];
    }
    if (body.probe_2_status !== undefined) updateData.probe_2_status = body.probe_2_status;
    // Install planning fields
    if (body.route_order !== undefined) updateData.route_order = body.route_order;
    if (body.planned_installer !== undefined) updateData.planned_installer = body.planned_installer;
    if (body.ready_to_install !== undefined) updateData.ready_to_install = body.ready_to_install;
    // NRCS
    if (body.NRCS_field !== undefined) updateData.NRCS_field = body.NRCS_field;
    // Approval
    if (body.approval_status !== undefined) updateData.approval_status = body.approval_status;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`;
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
        { error: 'Failed to update field season' },
        { status: response.status }
      );
    }

    const updated = await response.json();
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
