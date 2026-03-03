import { NextRequest, NextResponse } from 'next/server';
import { getFieldsData } from '@/lib/fields-data';

export async function GET(request: NextRequest) {
  const season = request.nextUrl.searchParams.get('season');

  if (!season || isNaN(Number(season))) {
    return NextResponse.json({ error: 'Valid season year is required' }, { status: 400 });
  }

  const data = await getFieldsData(Number(season));

  return NextResponse.json({
    fields: data.fields,
    probeAssignments: data.probeAssignments,
  });
}
