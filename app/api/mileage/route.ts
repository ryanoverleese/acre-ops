import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASE = 'https://api.baserow.io/api/database/rows/table';
const TOKEN = process.env.BASEROW_API_TOKEN;

// GET /api/mileage?installer=Brian&date=2026-05-18  (date optional — omit for all logs)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const installer = searchParams.get('installer');
  const date = searchParams.get('date');

  if (!installer) {
    return NextResponse.json({ error: 'installer required' }, { status: 400 });
  }

  let url = `${BASE}/${TABLE_IDS.mileage_logs}/?user_field_names=true&size=500&order_by=-date`;
  if (date) {
    url += `&filters=${encodeURIComponent(JSON.stringify({
      filter_type: 'AND',
      filters: [{ field: 'date', type: 'date_equal', value: date }],
    }))}`;
  }

  const res = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
  if (!res.ok) return NextResponse.json({ logs: [] });

  const data = await res.json();
  const logs = (data.results ?? []).filter((row: Record<string, unknown>) => row.installer === installer);

  return NextResponse.json({ logs });
}

// POST /api/mileage — create a new log
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { installer_name, date, start_miles, end_miles, notes } = body;

    if (!installer_name || !date) {
      return NextResponse.json({ error: 'installer_name and date required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      installer: installer_name,
      date,
    };
    if (start_miles != null) payload.start_miles = start_miles;
    if (end_miles != null) payload.end_miles = end_miles;
    if (notes) payload.notes = notes;

    const res = await fetch(`${BASE}/${TABLE_IDS.mileage_logs}/?user_field_names=true`, {
      method: 'POST',
      headers: { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Baserow mileage POST error:', res.status, err);
      return NextResponse.json({ error: 'Failed to save' }, { status: res.status });
    }

    return NextResponse.json(await res.json(), { status: 201 });
  } catch (e) {
    console.error('mileage POST error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/mileage?id=123 — update existing log
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await request.json();
    const payload: Record<string, unknown> = {};
    if (body.start_miles != null) payload.start_miles = body.start_miles;
    if (body.end_miles != null) payload.end_miles = body.end_miles;
    if (body.notes != null) payload.notes = body.notes;

    const res = await fetch(`${BASE}/${TABLE_IDS.mileage_logs}/${id}/?user_field_names=true`, {
      method: 'PATCH',
      headers: { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Baserow mileage PATCH error:', res.status, err);
      return NextResponse.json({ error: 'Failed to update' }, { status: res.status });
    }

    return NextResponse.json(await res.json());
  } catch (e) {
    console.error('mileage PATCH error', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
