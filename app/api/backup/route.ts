import { NextResponse } from 'next/server';
import { TABLE_IDS, type TableName } from '@/lib/baserow';
import { auth } from '@/auth';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Fetch all rows from a table (paginated)
async function fetchAllRows(tableId: number): Promise<Record<string, unknown>[]> {
  const allResults: Record<string, unknown>[] = [];
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

// Convert value to CSV-safe string
function csvValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    // Link fields come as arrays of objects with id/value
    const text = val.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return (item as Record<string, unknown>).value || (item as Record<string, unknown>).name || (item as Record<string, unknown>).id || '';
      }
      return String(item);
    }).join('; ');
    return csvEscape(text);
  }
  if (typeof val === 'object') {
    // Single select fields come as { id, value, color }
    const obj = val as Record<string, unknown>;
    if ('value' in obj) return csvEscape(String(obj.value || ''));
    return csvEscape(JSON.stringify(val));
  }
  return csvEscape(String(val));
}

function csvEscape(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Convert rows to CSV string
function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  // Collect all unique headers across all rows
  const headerSet = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => headerSet.add(key)));
  const headers = Array.from(headerSet);

  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(','));

  for (const row of rows) {
    const values = headers.map((header) => csvValue(row[header]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

export async function GET() {
  // Require admin auth
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Exclude users table from backup (contains password hashes)
    const excludeTables: TableName[] = ['users'];
    const tableNames = (Object.keys(TABLE_IDS) as TableName[]).filter(
      (name) => !excludeTables.includes(name)
    );

    // Fetch all tables in parallel
    const results = await Promise.all(
      tableNames.map(async (name) => {
        const rows = await fetchAllRows(TABLE_IDS[name]);
        return { name, rows };
      })
    );

    // Build a combined CSV file with table separators
    const sections: string[] = [];
    const summary: string[] = ['=== ACRE OPS BACKUP ===', `Date: ${new Date().toISOString()}`, '', 'Tables:'];

    for (const { name, rows } of results) {
      summary.push(`  ${name}: ${rows.length} rows`);
      const csv = rowsToCsv(rows);
      sections.push(`\n\n========== ${name.toUpperCase()} (${rows.length} rows) ==========\n${csv}`);
    }

    const fullContent = summary.join('\n') + '\n' + sections.join('');
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `acre-ops-backup-${timestamp}.csv`;

    return new NextResponse(fullContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
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
