import { NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, { ok: boolean; rowCount?: number; error?: string; sampleFields?: string[] }> = {};

  // Test each table
  for (const [tableName, tableId] of Object.entries(TABLE_IDS)) {
    try {
      const url = `${BASEROW_API_URL}/${tableId}/?user_field_names=true&page=1&size=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Token ${BASEROW_TOKEN}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        const text = await response.text();
        results[tableName] = { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
      } else {
        const data = await response.json();
        const sampleFields = data.results?.[0] ? Object.keys(data.results[0]).slice(0, 20) : [];
        results[tableName] = {
          ok: true,
          rowCount: data.count,
          sampleFields,
        };
      }
    } catch (err) {
      results[tableName] = { ok: false, error: String(err) };
    }
  }

  // Also test the field schema endpoint for field_seasons to see what columns exist
  let fieldSeasonSchema: { name: string; type: string }[] = [];
  try {
    const schemaUrl = `https://api.baserow.io/api/database/fields/table/${TABLE_IDS.field_seasons}/`;
    const schemaResp = await fetch(schemaUrl, {
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    if (schemaResp.ok) {
      const fields = await schemaResp.json();
      fieldSeasonSchema = fields.map((f: { name: string; type: string }) => ({
        name: f.name,
        type: f.type,
      }));
    }
  } catch (err) {
    fieldSeasonSchema = [{ name: 'ERROR', type: String(err) }];
  }

  // Check env vars (existence only, not values)
  const envCheck = {
    BASEROW_API_TOKEN: !!BASEROW_TOKEN,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    BASEROW_EMAIL: !!process.env.BASEROW_EMAIL,
    BASEROW_PASSWORD: !!process.env.BASEROW_PASSWORD,
  };

  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    envVars: envCheck,
    tables: results,
    fieldSeasonSchema,
  });
}
