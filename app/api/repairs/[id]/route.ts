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
    const repairId = parseInt(id, 10);

    if (isNaN(repairId)) {
      return NextResponse.json(
        { error: 'Invalid repair ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.problem !== undefined) updateData.problem = body.problem;
    if (body.fix !== undefined) updateData.fix = body.fix;
    if (body.repaired_at !== undefined) updateData.repaired_at = body.repaired_at;
    if (body.notified_customer !== undefined) updateData.notified_customer = body.notified_customer;
    if (body.probe_replaced !== undefined) updateData.probe_replaced = body.probe_replaced;
    if (body.new_probe_serial !== undefined) updateData.new_probe_serial = body.new_probe_serial;
    if (body.field_season !== undefined) {
      updateData.field_season = body.field_season ? [body.field_season] : [];
    }
    if (body.probe_assignment !== undefined) {
      updateData.probe_assignment = body.probe_assignment ? [body.probe_assignment] : [];
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.repairs}/${repairId}/?user_field_names=true`;
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
        { error: 'Failed to update repair' },
        { status: response.status }
      );
    }

    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const repairId = parseInt(id, 10);

    if (isNaN(repairId)) {
      return NextResponse.json(
        { error: 'Invalid repair ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.repairs}/${repairId}/`;
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
        { error: 'Failed to delete repair' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
