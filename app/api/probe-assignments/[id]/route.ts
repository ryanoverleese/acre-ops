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
    const probeAssignmentId = parseInt(id, 10);

    if (isNaN(probeAssignmentId)) {
      return NextResponse.json(
        { error: 'Invalid probe assignment ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Placement data
    if (body.placement_lat !== undefined) updateData.placement_lat = body.placement_lat;
    if (body.placement_lng !== undefined) updateData.placement_lng = body.placement_lng;
    if (body.elevation !== undefined) updateData.elevation = body.elevation;
    if (body.soil_type !== undefined) updateData.soil_type = body.soil_type;
    if (body.placement_notes !== undefined) updateData.placement_notes = body.placement_notes;

    // Probe assignment - only update when explicitly provided with a numeric ID or 0/empty to clear
    if (body.probe !== undefined && body.probe !== null) {
      updateData.probe = body.probe ? [body.probe] : [];
    }
    if (body.probe_number !== undefined) updateData.probe_number = body.probe_number;
    if (body.probe_status !== undefined) updateData.probe_status = body.probe_status;
    if (body.antenna_type !== undefined) updateData.antenna_type = body.antenna_type;

    // Install data
    if (body.installer !== undefined) updateData.installer = body.installer;
    if (body.install_date !== undefined) updateData.install_date = body.install_date;
    if (body.install_lat !== undefined) updateData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) updateData.install_lng = body.install_lng;
    if (body.install_notes !== undefined) updateData.install_notes = body.install_notes;
    if (body.cropx_telemetry_id !== undefined) updateData.cropx_telemetry_id = body.cropx_telemetry_id;
    if (body.signal_strength !== undefined) updateData.signal_strength = body.signal_strength;

    // Approval data
    if (body.approval_status !== undefined) updateData.approval_status = body.approval_status;
    if (body.approval_notes !== undefined) updateData.approval_notes = body.approval_notes;
    if (body.approval_date !== undefined) updateData.approval_date = body.approval_date;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${probeAssignmentId}/?user_field_names=true`;
    console.log('PATCH probe assignment:', probeAssignmentId, 'with data:', JSON.stringify(updateData));

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
      console.error('Request body was:', JSON.stringify(updateData));
      return NextResponse.json(
        { error: 'Failed to update probe assignment', details: errorText },
        { status: response.status }
      );
    }

    const updated = await response.json();
    revalidatePath('/fields');
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating probe assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const probeAssignmentId = parseInt(id, 10);

    if (isNaN(probeAssignmentId)) {
      return NextResponse.json(
        { error: 'Invalid probe assignment ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${probeAssignmentId}/`;
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
        { error: 'Failed to delete probe assignment' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting probe assignment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
