import { NextResponse } from 'next/server';
import { getRows, TABLE_IDS, bustTableCache, type Installer } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function getInstallers(): Promise<Installer[]> {
  return getRows<Installer>('installers');
}

export async function getInstallerByName(name: string): Promise<Installer | null> {
  const all = await getInstallers();
  return all.find(i => i.name === name) ?? null;
}

// GET — returns all installers with whether a PIN is set
export async function GET() {
  try {
    const installers = await getInstallers();
    return NextResponse.json(
      installers.map(i => ({ id: i.id, name: i.name ?? '', pinSet: !!i.pin }))
    );
  } catch (error) {
    console.error('installer-pins GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch installers' }, { status: 500 });
  }
}

// PATCH — update or clear a PIN for an existing row
export async function PATCH(request: Request) {
  try {
    const { id, pin } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    if (pin !== '' && pin !== null && !/^\d{4,6}$/.test(String(pin))) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
    }

    const res = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.installers}/${id}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Token ${BASEROW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || '' }),
      }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    bustTableCache('installers');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('installer-pins PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST — create a new installer row
export async function POST(request: Request) {
  try {
    const { name, pin } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    if (pin && !/^\d{4,6}$/.test(String(pin))) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
    }

    const res = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.installers}/?user_field_names=true`,
      {
        method: 'POST',
        headers: { Authorization: `Token ${BASEROW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin: pin || '' }),
      }
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    const row = await res.json();
    bustTableCache('installers');
    return NextResponse.json({ id: row.id, name: row.name, pinSet: !!row.pin });
  } catch (error) {
    console.error('installer-pins POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE — remove an installer row
export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const res = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.installers}/${id}/`,
      {
        method: 'DELETE',
        headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      }
    );
    if (!res.ok && res.status !== 204) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    bustTableCache('installers');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('installer-pins DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
