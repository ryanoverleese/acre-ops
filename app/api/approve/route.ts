import { NextRequest, NextResponse } from 'next/server';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const FIELD_SEASONS_TABLE_ID = 817300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fieldSeasonId, fieldSeasonIds, action, notes } = body;

    if (action === 'bulk_approve') {
      // Bulk approve multiple fields
      if (!Array.isArray(fieldSeasonIds) || fieldSeasonIds.length === 0) {
        return NextResponse.json({ error: 'fieldSeasonIds array is required' }, { status: 400 });
      }

      const today = new Date().toISOString().split('T')[0];
      const results = await Promise.all(
        fieldSeasonIds.map(async (id: number) => {
          const response = await fetch(`${BASEROW_API_URL}/${FIELD_SEASONS_TABLE_ID}/${id}/?user_field_names=true`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Token ${BASEROW_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              approval_status: 'Approved',
              approval_date: today,
            }),
          });
          return response.ok;
        })
      );

      const successCount = results.filter(Boolean).length;
      return NextResponse.json({ success: true, approved: successCount });
    }

    if (action === 'approve') {
      if (!fieldSeasonId) {
        return NextResponse.json({ error: 'fieldSeasonId is required' }, { status: 400 });
      }

      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`${BASEROW_API_URL}/${FIELD_SEASONS_TABLE_ID}/${fieldSeasonId}/?user_field_names=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approval_status: 'Approved',
          approval_date: today,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Baserow API error:', response.status, errorText);
        return NextResponse.json({ error: 'Failed to approve field' }, { status: response.status });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'request_change') {
      if (!fieldSeasonId) {
        return NextResponse.json({ error: 'fieldSeasonId is required' }, { status: 400 });
      }

      if (!notes) {
        return NextResponse.json({ error: 'notes are required for change request' }, { status: 400 });
      }

      const response = await fetch(`${BASEROW_API_URL}/${FIELD_SEASONS_TABLE_ID}/${fieldSeasonId}/?user_field_names=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approval_status: 'Change Requested',
          approval_notes: notes,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Baserow API error:', response.status, errorText);
        return NextResponse.json({ error: 'Failed to request change' }, { status: response.status });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Approve API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
