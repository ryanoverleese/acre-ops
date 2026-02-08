import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.field) {
      return NextResponse.json(
        { error: 'Field ID is required' },
        { status: 400 }
      );
    }

    if (!body.season) {
      return NextResponse.json(
        { error: 'Season is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      field: [body.field],
      season: parseInt(body.season, 10),
    };

    if (body.crop) createData.crop = body.crop;
    // service_type is a Link field to products_services — needs array of row IDs
    if (body.service_type) createData.service_type = [parseInt(body.service_type, 10)];
    if (body.antenna_type) createData.antenna_type = body.antenna_type;
    if (body.battery_type) createData.battery_type = body.battery_type;
    if (body.side_dress) createData.side_dress = body.side_dress;
    if (body.logger_id) createData.logger_id = body.logger_id;
    if (body.early_removal) createData.early_removal = body.early_removal;
    if (body.hybrid_variety) createData.hybrid_variety = body.hybrid_variety;
    if (body.ready_to_remove) createData.ready_to_remove = body.ready_to_remove;
    if (body.planting_date) createData.planting_date = body.planting_date;
    if (body.probe) createData.probe = [body.probe];
    createData.probe_status = body.probe_status || 'Unassigned';

    const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create field season' },
        { status: response.status }
      );
    }

    const created = await response.json();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating field season:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
