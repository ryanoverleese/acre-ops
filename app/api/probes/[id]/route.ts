import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';


interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withApiAuth(async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const probeId = parseInt(id, 10);

    if (isNaN(probeId)) {
      return NextResponse.json(
        { error: 'Invalid probe ID' },
        { status: 400 }
      );
    }

    const url = { table: 'probes', id: probeId };
    const response = await dataRequest(url, {  });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch probe' },
        { status: response.status }
      );
    }

    const probe = await response.json();
    return NextResponse.json(probe);
  } catch (error) {
    console.error('Error fetching probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const PATCH = withApiAuth(async function PATCH(request: NextRequest, { params }: RouteParams) {
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
    if (body.trade_year !== undefined) updateData.trade_year = body.trade_year || null;
    if (body.is_trade !== undefined) updateData.is_trade = body.is_trade;

    const url = { table: 'probes', id: probeId };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update probe', detail: errorText },
        { status: response.status }
      );
    }

    const updatedProbe = await response.json();
    bustTableCache('probes');
    return NextResponse.json(updatedProbe);
  } catch (error) {
    console.error('Error updating probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiAuth(async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const probeId = parseInt(id, 10);

    if (isNaN(probeId)) {
      return NextResponse.json(
        { error: 'Invalid probe ID' },
        { status: 400 }
      );
    }

    const url = { table: 'probes', id: probeId };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete probe' },
        { status: response.status }
      );
    }

    bustTableCache('probes');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
