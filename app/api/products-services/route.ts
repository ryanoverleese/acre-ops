import { withApiAuth, dataRequest } from '@/lib/supabase/api';
import { NextResponse } from 'next/server';
import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const GET = withApiAuth(async function GET() {
  const response = await dataRequest({ table: 'products_services' });
  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: 'Failed to fetch products & services' }, { status: response.status });
  }

  const data = await response.json();
  const items = data.results
    .filter((r: { active?: boolean; status?: { value: string } }) => r.active !== false && (!r.status || r.status?.value === 'Active'))
    .map((r: {
      id: number;
      service_type?: string;
      rate?: number;
      dealer_fee?: number;
      description?: string;
      category?: { value: string };
      unit?: { value: string };
    }) => ({
      id: r.id,
      serviceType: r.service_type || '',
      rate: r.rate || 0,
      dealerFee: r.dealer_fee || 0,
      description: r.description || '',
      category: r.category?.value || '',
      unit: r.unit?.value || '',
    }));

  return NextResponse.json(items);
});

export const { POST } = crudCollection({
  table: 'products_services',
  createStatus: 201,
  mapCreate: (body) =>
    pick(body, [
      'service_type',
      'rate',
      'dealer_fee',
      'description',
      'status',
      'category',
      'unit',
      'active',
    ]),
});
