import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.serial_number) {
      return NextResponse.json(
        { error: 'Serial number is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      serial_number: body.serial_number,
    };

    if (body.brand) createData.brand = body.brand;
    if (body.billing_entity) createData.billing_entity = [body.billing_entity];
    if (body.contact) createData.contact = [body.contact];
    if (body.year_new) createData.year_new = body.year_new;
    if (body.status) createData.status = body.status;
    if (body.rack) createData.rack = body.rack;
    if (body.rack_slot) createData.rack_slot = body.rack_slot;
    if (body.notes) createData.notes = body.notes;
    if (body.damages_repairs) createData.damages_repairs = body.damages_repairs;
    // Auto-fill date_created with current date
    createData.date_created = new Date().toISOString().split('T')[0];

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probes}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create probe' },
        { status: response.status }
      );
    }

    const newProbe = await response.json();
    return NextResponse.json(newProbe, { status: 201 });
  } catch (error) {
    console.error('Error creating probe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
