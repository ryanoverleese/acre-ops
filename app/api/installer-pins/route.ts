import { NextResponse } from 'next/server';

// PINs are stored in INSTALLER_PINS env var as JSON: {"Alice":"1234","Bob":"5678"}
// Update this in Netlify > Site configuration > Environment variables.

export function readPins(): Record<string, string> {
  try {
    const raw = process.env.INSTALLER_PINS;
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// GET — returns current pins (masked: shows whether a PIN is set, not the value)
export async function GET() {
  const pins = readPins();
  // Return masked version: true = PIN set, false = not set
  const masked: Record<string, boolean> = {};
  for (const name of Object.keys(pins)) {
    masked[name] = true;
  }
  return NextResponse.json({ configured: masked });
}
