import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PINS_FILE = path.join(process.cwd(), 'installer-pins.json');

function readPins(): Record<string, string> {
  try {
    const raw = fs.readFileSync(PINS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePins(pins: Record<string, string>) {
  fs.writeFileSync(PINS_FILE, JSON.stringify(pins, null, 2), 'utf-8');
}

export async function GET() {
  const pins = readPins();
  return NextResponse.json(pins);
}

export async function PATCH(request: Request) {
  try {
    const { installer, pin } = await request.json();
    if (!installer || typeof installer !== 'string') {
      return NextResponse.json({ error: 'installer name required' }, { status: 400 });
    }
    if (pin !== '' && (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin))) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
    }

    const pins = readPins();
    if (pin === '') {
      delete pins[installer];
    } else {
      pins[installer] = pin;
    }
    writePins(pins);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating installer PIN:', error);
    return NextResponse.json({ error: 'Failed to update PIN' }, { status: 500 });
  }
}
