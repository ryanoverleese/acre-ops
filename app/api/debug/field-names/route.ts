import { NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Diagnostic endpoint: returns actual Baserow field names for the field_seasons table
// Call: GET /api/debug/field-names
export async function GET() {
  try {
    // Fetch table fields schema from Baserow
    const schemaUrl = `https://api.baserow.io/api/database/fields/table/${TABLE_IDS.field_seasons}/`;
    const schemaRes = await fetch(schemaUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });

    if (!schemaRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch schema', status: schemaRes.status }, { status: 500 });
    }

    const fields = await schemaRes.json();
    // Return just field names and types, focusing on probe-related fields
    const allFields = fields.map((f: { name: string; type: string; id: number }) => ({
      id: f.id,
      name: f.name,
      type: f.type,
    }));
    const probeFields = allFields.filter((f: { name: string }) =>
      f.name.toLowerCase().includes('probe')
    );

    // Also fetch one row to see actual key names in response
    const rowUrl = `https://api.baserow.io/api/database/rows/table/${TABLE_IDS.field_seasons}/?user_field_names=true&size=1`;
    const rowRes = await fetch(rowUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    const rowData = await rowRes.json();
    const sampleRow = rowData.results?.[0];
    const sampleKeys = sampleRow ? Object.keys(sampleRow) : [];
    const probeKeys = sampleKeys.filter(k => k.toLowerCase().includes('probe'));

    return NextResponse.json({
      schemaProbeFields: probeFields,
      allSchemaFields: allFields,
      sampleRowProbeKeys: probeKeys,
      sampleRowAllKeys: sampleKeys,
    });
  } catch (error) {
    console.error('Debug field-names error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
