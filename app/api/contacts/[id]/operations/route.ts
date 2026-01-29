import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Add an operation to a contact's operations link
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const contactId = parseInt(id, 10);
    const body = await request.json();
    const { operationId, isMainContact } = body;

    if (!operationId) {
      return NextResponse.json({ error: 'operationId is required' }, { status: 400 });
    }

    // First, fetch the current contact to get existing operations
    const getResponse = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.contacts}/${contactId}/?user_field_names=true`,
      {
        headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      }
    );

    if (!getResponse.ok) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const contact = await getResponse.json();
    const currentOperations = contact.operations || [];
    const currentOperationIds = currentOperations.map((op: { id: number }) => op.id);

    // Add the new operation if not already linked
    if (!currentOperationIds.includes(operationId)) {
      currentOperationIds.push(operationId);
    }

    // Update the contact with the new operations array and optionally is_main_contact
    const updateData: Record<string, unknown> = {
      operations: currentOperationIds,
    };
    if (isMainContact !== undefined) {
      updateData.is_main_contact = isMainContact;
    }

    const patchResponse = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.contacts}/${contactId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error('Baserow error:', errorText);
      return NextResponse.json({ error: 'Failed to link contact to operation' }, { status: patchResponse.status });
    }

    const updated = await patchResponse.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error linking contact to operation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Remove an operation from a contact's operations link
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const contactId = parseInt(id, 10);
    const { searchParams } = new URL(request.url);
    const operationId = parseInt(searchParams.get('operationId') || '', 10);

    if (!operationId) {
      return NextResponse.json({ error: 'operationId query param is required' }, { status: 400 });
    }

    // First, fetch the current contact to get existing operations
    const getResponse = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.contacts}/${contactId}/?user_field_names=true`,
      {
        headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      }
    );

    if (!getResponse.ok) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const contact = await getResponse.json();
    const currentOperations = contact.operations || [];
    const updatedOperationIds = currentOperations
      .map((op: { id: number }) => op.id)
      .filter((opId: number) => opId !== operationId);

    // Update the contact with the filtered operations array
    const patchResponse = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.contacts}/${contactId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operations: updatedOperationIds }),
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error('Baserow error:', errorText);
      return NextResponse.json({ error: 'Failed to unlink contact from operation' }, { status: patchResponse.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlinking contact from operation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
