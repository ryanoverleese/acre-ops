import { NextResponse } from 'next/server';
import { getAllSelectOptions } from '@/lib/baserow';
import type { TableName } from '@/lib/baserow';

const OPTION_TABLES: TableName[] = ['fields', 'field_seasons', 'probe_assignments'];

export async function GET() {
  try {
    const allOptions = await getAllSelectOptions(OPTION_TABLES);
    return NextResponse.json(allOptions);
  } catch (error) {
    console.error('Error fetching select options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch select options' },
      { status: 500 }
    );
  }
}
