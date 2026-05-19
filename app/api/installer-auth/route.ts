import { NextResponse } from 'next/server';
import { getInstallerByName } from '@/app/api/installer-pins/route';

export async function POST(request: Request) {
  try {
    const { installer, pin } = await request.json();
    if (!installer || !pin) {
      return NextResponse.json({ error: 'installer and pin required' }, { status: 400 });
    }
    const row = await getInstallerByName(installer);
    if (!row) {
      return NextResponse.json({ error: 'Installer not found' }, { status: 401 });
    }
    if (!row.pin) {
      return NextResponse.json({ error: 'No PIN configured for this installer' }, { status: 401 });
    }
    if (row.pin !== String(pin)) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error('installer-auth error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
