import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const NOTE_TITLE = 'Probe Removals';

export async function POST(request: NextRequest) {
  try {
    const { serial, reason, date, fieldName, operation } = await request.json();

    const dateStr = date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const parts = [dateStr, `#${serial}`, reason];
    if (fieldName) parts.push(fieldName);
    if (operation) parts.push(operation);
    const newLine = parts.join(' – ');

    // Find existing note
    const listRes = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.documents}/?user_field_names=true&size=200`,
      { headers: { 'Authorization': `Token ${BASEROW_TOKEN}` } }
    );
    const listData = await listRes.json();
    const existing = (listData.results ?? []).find(
      (r: { name?: string }) => r.name === NOTE_TITLE
    );

    if (existing) {
      // Append new line to existing note
      const updated = existing.description ? `${existing.description}\n${newLine}` : newLine;
      await fetch(`${BASEROW_API_URL}/${TABLE_IDS.documents}/${existing.id}/?user_field_names=true`, {
        method: 'PATCH',
        headers: { 'Authorization': `Token ${BASEROW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: updated, uploaded_at: new Date().toISOString() }),
      });
    } else {
      // Create it fresh
      await fetch(`${BASEROW_API_URL}/${TABLE_IDS.documents}/?user_field_names=true`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${BASEROW_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: NOTE_TITLE,
          description: newLine,
          uploaded_by: 'Ryan',
          uploaded_at: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('log-removal error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
