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

    // Also fetch a few rows to see actual key names and service_type values
    const rowUrl = `https://api.baserow.io/api/database/rows/table/${TABLE_IDS.field_seasons}/?user_field_names=true&size=5`;
    const rowRes = await fetch(rowUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    const rowData = await rowRes.json();
    const sampleRow = rowData.results?.[0];
    const sampleKeys = sampleRow ? Object.keys(sampleRow) : [];
    const probeKeys = sampleKeys.filter(k => k.toLowerCase().includes('probe'));
    const serviceTypeKeys = sampleKeys.filter(k => k.toLowerCase().includes('service'));

    // Extract service_type data from all sample rows (raw, before normalizeKeys)
    const serviceTypeData = (rowData.results || []).map((row: Record<string, unknown>) => {
      // Check both "service_type" and "service type" keys
      return {
        id: row.id,
        service_type_underscore: row['service_type'],
        service_type_space: row['service type'],
        // Also check if there's any key containing "service"
        serviceKeys: Object.keys(row).filter(k => k.toLowerCase().includes('service')),
      };
    });

    return NextResponse.json({
      schemaProbeFields: probeFields,
      allSchemaFields: allFields,
      sampleRowProbeKeys: probeKeys,
      sampleRowAllKeys: sampleKeys,
      serviceTypeKeys,
      serviceTypeData,
    });
  } catch (error) {
    console.error('Debug field-names error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
