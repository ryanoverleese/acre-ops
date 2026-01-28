import { NextRequest, NextResponse } from 'next/server';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const OPERATIONS_TABLE_ID = 817295;

// Generate a random alphanumeric token
function generateToken(length: number = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const operationId = parseInt(id, 10);

    if (isNaN(operationId)) {
      return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const regenerate = body.regenerate === true;

    // First, get the current operation to check if it already has a token
    const getResponse = await fetch(
      `${BASEROW_API_URL}/${OPERATIONS_TABLE_ID}/${operationId}/?user_field_names=true`,
      {
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!getResponse.ok) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    const operation = await getResponse.json();

    // If token exists and not regenerating, return existing token
    if (operation.approval_token && !regenerate) {
      return NextResponse.json({
        token: operation.approval_token,
        isNew: false
      });
    }

    // Generate new token
    const newToken = generateToken(12);

    // Save token to Baserow
    const patchResponse = await fetch(
      `${BASEROW_API_URL}/${OPERATIONS_TABLE_ID}/${operationId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approval_token: newToken,
        }),
      }
    );

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      console.error('Baserow API error:', patchResponse.status, errorText);
      return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
    }

    return NextResponse.json({
      token: newToken,
      isNew: true
    });
  } catch (error) {
    console.error('Generate token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
