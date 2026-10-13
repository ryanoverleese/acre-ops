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
    if (body.watch_list !== undefined) updateData.watch_list = body.watch_list;
    if (body.field_season !== undefined) {
      updateData.field_season = body.field_season ? [body.field_season] : [];
    }
    if (body.probe_assignment !== undefined) {
      updateData.probe_assignment = body.probe_assignment ? [body.probe_assignment] : [];
    }

    const url = { table: 'repairs', id: repairId };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update repair' },
        { status: response.status }
      );
    }

    const updated = await response.json();
    bustTableCache('repairs');
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiAuth(async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const repairId = parseInt(id, 10);

    if (isNaN(repairId)) {
      return NextResponse.json(
        { error: 'Invalid repair ID' },
        { status: 400 }
      );
    }

    const url = { table: 'repairs', id: repairId };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete repair' },
        { status: response.status }
      );
    }

    bustTableCache('repairs');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
