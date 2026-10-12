import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withApiAuth(async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const url = { table: 'operations', id: operationId };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update operation' },
        { status: response.status }
      );
    }

    const updatedOperation = await response.json();
    bustTableCache('operations');
    return NextResponse.json(updatedOperation);
  } catch (error) {
    console.error('Error updating operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiAuth(async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const operationId = parseInt(id, 10);

    if (isNaN(operationId)) {
      return NextResponse.json(
        { error: 'Invalid operation ID' },
        { status: 400 }
      );
    }

    const url = { table: 'operations', id: operationId };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete operation' },
        { status: response.status }
      );
    }

    bustTableCache('operations');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
