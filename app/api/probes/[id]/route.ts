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
    const probeId = parseInt(id, 10);

    if (isNaN(probeId)) {
      return NextResponse.json(
        { error: 'Invalid probe ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.serial_number !== undefined) updateData.serial_number = body.serial_number;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.billing_entity !== undefined) {
      updateData.billing_entity = body.billing_entity ? [body.billing_entity] : [];
    }
    if (body.contact !== undefined) {
      updateData.contact = body.contact ? [body.contact] : [];
    }
    if (body.year_new !== undefined) updateData.year_new = body.year_new;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.rack !== undefined) updateData.rack = body.rack;
    if (body.rack_slot !== undefined) updateData.rack_slot = body.rack_slot ? parseInt(body.rack_slot, 10) : null;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.damages_repairs !== undefined) updateData.damages_repairs = body.damages_repairs;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probes}/${probeId}/?user_field_names=true`;
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
        { error: 'Failed to update probe' },
        { status: response.status }
      );
    }

    const updatedProbe = await response.json();
    return NextResponse.json(updatedProbe);
  } catch (error) {
    console.error('Error updating probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const probeId = parseInt(id, 10);

    if (isNaN(probeId)) {
      return NextResponse.json(
        { error: 'Invalid probe ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probes}/${probeId}/`;
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
        { error: 'Failed to delete probe' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
