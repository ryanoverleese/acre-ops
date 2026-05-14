import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { serial, reason, date, fieldName, operation } = await request.json();

    const noteParts = [`Serial: ${serial}`, `Reason: ${reason}`];
    if (fieldName) noteParts.push(`Field: ${fieldName}`);
    if (operation) noteParts.push(`Operation: ${operation}`);

    const payload = {
      name: `Probe Removed – #${serial}`,
      description: noteParts.join('\n'),
      uploaded_by: 'Ryan',
      uploaded_at: date || new Date().toISOString(),
    };

    const res = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.documents}/?user_field_names=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: err }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('log-removal error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
