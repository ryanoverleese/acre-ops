import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


export const GET = withApiAuth(async function GET() {
  try {
    const url = { table: 'products_services' };
    const response = await dataRequest(url, {  });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch products & services' },
        { status: response.status }
      );
    }

    const data = await response.json();

    const items = data.results
      .filter((r: { active?: boolean; status?: { value: string } }) => r.active !== false && (!r.status || r.status?.value === 'Active'))
      .map((r: { id: number; service_type?: string; rate?: number; dealer_fee?: number; description?: string; category?: { value: string }; unit?: { value: string } }) => ({
        id: r.id,
        serviceType: r.service_type || '',
        rate: r.rate || 0,
        dealerFee: r.dealer_fee || 0,
        description: r.description || '',
        category: r.category?.value || '',
        unit: r.unit?.value || '',
      }));

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching products & services:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.service_type) createData.service_type = body.service_type;
    if (body.rate !== undefined) createData.rate = body.rate;
    if (body.dealer_fee !== undefined) createData.dealer_fee = body.dealer_fee;
    if (body.description) createData.description = body.description;
    if (body.status) createData.status = body.status;
    if (body.category) createData.category = body.category;
    if (body.unit) createData.unit = body.unit;
    if (body.active !== undefined) createData.active = body.active;

    const url = { table: 'products_services' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create product/service' },
        { status: response.status }
      );
    }

    const newItem = await response.json();
    bustTableCache('products_services');
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating product/service:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
