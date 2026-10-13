import { withApiAuth, assertCustomerField, operationForToken } from '@/lib/supabase/api';
import { transaction } from '@/lib/supabase/database';
import { DataError } from '@/lib/supabase/registry';
import { NextRequest, NextResponse } from 'next/server';
import { createRow, getRows, updateRow } from '@/lib/baserow';
import type { Notification } from '@/lib/baserow';

// GET: Fetch unread notifications, sorted by created_on desc
export const GET = withApiAuth(async function GET() {
  try {
    const notifications = await getRows<Notification>('notifications', {
      size: 50,
    });

    // Filter to unread only
    const unread = notifications.filter((n) => !n.read);

    return NextResponse.json({ notifications: unread });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
});

// POST: Create a notification
export const POST = withApiAuth(async function POST(request: NextRequest, _context, current) {
  try {
    const body = await request.json();
    const { operationId, fieldId, changed_field, new_value, page_type } = body;
    if (current.kind === 'customer') {
      const operation = await operationForToken(current.token);
      if (Number(operationId) !== operation || !fieldId) throw new DataError('Customer field and operation required',403);
      await assertCustomerField(current.token,fieldId);
    }

    if (!changed_field) {
      return NextResponse.json({ error: 'changed_field is required' }, { status: 400 });
    }

    const rowData: Record<string, unknown> = {
      changed_field,
      new_value: new_value || '',
      page_type: page_type === 'Field Info' || !page_type ? 'field-info' : page_type,
      read: false,
      created_on: new Date().toISOString(),
    };

    // Link fields use array of IDs
    if (operationId) {
      rowData.operation = [operationId];
    }
    if (fieldId) {
      rowData.field = [fieldId];
    }

    const notification = await createRow<Notification>('notifications', rowData);
    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  }
});

// PATCH: Mark notifications as read (bulk)
export const PATCH = withApiAuth(async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    await transaction(async () => { for (const id of ids) await updateRow('notifications',id,{read:true}); });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notifications PATCH error:', error);
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
});
