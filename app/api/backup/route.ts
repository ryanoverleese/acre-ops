import { NextResponse } from 'next/server';
import { TABLE_IDS, type TableName } from '@/lib/baserow';
import { auth } from '@/auth';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Fetch all rows from a table (paginated)
async function fetchAllRows(tableId: number): Promise<unknown[]> {
  const allResults: unknown[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      user_field_names: 'true',
      page: page.toString(),
      size: '200',
    });

    const response = await fetch(`${BASEROW_API_URL}/${tableId}/?${params}`, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Baserow API error for table ${tableId}: ${response.status}`);
    }

    const data = await response.json();
    allResults.push(...data.results);
    hasMore = data.next !== null;
    page++;
  }

  return allResults;
}

export async function GET() {
  // Require admin auth
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tableNames = Object.keys(TABLE_IDS) as TableName[];
    const backup: Record<string, { count: number; rows: unknown[] }> = {};

    // Fetch all tables in parallel
    const results = await Promise.all(
      tableNames.map(async (name) => {
        const rows = await fetchAllRows(TABLE_IDS[name]);
        return { name, rows };
      })
    );

    for (const { name, rows } of results) {
      backup[name] = { count: rows.length, rows };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `acre-ops-backup-${timestamp}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json(
      { error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}
