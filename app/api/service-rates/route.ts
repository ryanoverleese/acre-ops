import { NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function GET() {
  try {
    const url = `${BASEROW_API_URL}/${TABLE_IDS.service_rates}/?user_field_names=true&size=200`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch service rates' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Filter to only active rates and format for easy lookup
    const rates = data.results
      .filter((r: { status?: { value: string } }) => !r.status || r.status?.value === 'Active')
      .map((r: { id: number; service_type?: string; rate?: number; dealer_fee?: number; description?: string }) => ({
        id: r.id,
        serviceType: r.service_type || '',
        rate: r.rate || 0,
        dealerFee: r.dealer_fee || 0,
        description: r.description || '',
      }));

    return NextResponse.json(rates);
  } catch (error) {
    console.error('Error fetching service rates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
