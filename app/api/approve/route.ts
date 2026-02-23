import { NextRequest, NextResponse } from 'next/server';
import { createRow, getRow } from '@/lib/baserow';
import type { FieldSeason } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const FIELD_SEASONS_TABLE_ID = 817300;

function logApprovalNotification(fieldSeasonId: number, action: string, notes?: string) {
  getRow<FieldSeason>('field_seasons', fieldSeasonId)
    .then((fs) => {
      const fieldName = fs.field?.[0]?.value || 'Unknown Field';
      const newValue = action === 'request_change'
        ? `Requested changes: ${notes}`
        : action === 'undo' ? 'Approval undone' : 'Approved';
      return createRow('notifications', {
        field: fs.field?.[0]?.id ? [fs.field[0].id] : [],
        changed_field: `${fieldName} — Approval`,
        new_value: newValue,
        page_type: 'Approval',
        read: false,
      });
    })
    .catch((err) => console.error('Failed to create approval notification:', err));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fieldSeasonId, fieldSeasonIds, action, notes, undo } = body;

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

      // Fire-and-forget: log notifications for bulk approvals
      fieldSeasonIds.forEach((id: number) => logApprovalNotification(id, 'approve'));

      return NextResponse.json({ success: true, approved: successCount });
    }

    if (action === 'approve') {
      if (!fieldSeasonId) {
        return NextResponse.json({ error: 'fieldSeasonId is required' }, { status: 400 });
      }

      const patchBody = undo
        ? { approval_status: 'Pending', approval_date: '' }
        : { approval_status: 'Approved', approval_date: new Date().toISOString().split('T')[0] };
      const response = await fetch(`${BASEROW_API_URL}/${FIELD_SEASONS_TABLE_ID}/${fieldSeasonId}/?user_field_names=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Baserow API error:', response.status, errorText);
        console.error('Request was:', { fieldSeasonId, url: `${BASEROW_API_URL}/${FIELD_SEASONS_TABLE_ID}/${fieldSeasonId}/` });
        return NextResponse.json({ error: `Failed to approve field: ${errorText}` }, { status: response.status });
      }

      // Fire-and-forget: log notification (skip for undo actions)
      if (!undo) {
        logApprovalNotification(fieldSeasonId, 'approve');
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

      // Fire-and-forget: log notification for change request
      logApprovalNotification(fieldSeasonId, 'request_change', notes);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Approve API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
