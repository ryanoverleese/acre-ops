import { NextRequest, NextResponse } from 'next/server';
import { updateRow } from '@/lib/baserow';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rowId = parseInt(id, 10);
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.probe === null || body.probe === undefined) {
      updateData.probe = [];
    } else {
      updateData.probe = [body.probe];
    }

    const result = await updateRow('probe_rack', rowId, updateData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating probe rack slot:', error);
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 });
  }
}
