import { NextResponse } from 'next/server';
import { readPins } from '@/app/api/installer-pins/route';

export async function POST(request: Request) {
  try {
    const { installer, pin } = await request.json();
    if (!installer || !pin) {
      return NextResponse.json({ error: 'installer and pin required' }, { status: 400 });
    }
    const pins = readPins();
    if (!pins[installer]) {
      return NextResponse.json({ error: 'No PIN configured for this installer' }, { status: 401 });
    }
    if (pins[installer] !== String(pin)) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('installer-auth error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
