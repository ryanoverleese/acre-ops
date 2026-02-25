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
    const operationId = parseInt(id, 10);

    if (isNaN(operationId)) {
      return NextResponse.json(
        { error: 'Invalid operation ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.operations}/${operationId}/?user_field_names=true`;
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
        { error: 'Failed to update operation' },
        { status: response.status }
      );
    }

    const updatedOperation = await response.json();
    return NextResponse.json(updatedOperation);
  } catch (error) {
    console.error('Error updating operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const operationId = parseInt(id, 10);

    if (isNaN(operationId)) {
      return NextResponse.json(
        { error: 'Invalid operation ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.operations}/${operationId}/`;
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
        { error: 'Failed to delete operation' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
