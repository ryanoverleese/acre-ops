import { NextRequest, NextResponse } from 'next/server';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const FIELDS_TABLE_ID = 817299;
const FIELD_SEASONS_TABLE_ID = 817300;
const OPERATIONS_TABLE_ID = 826850;

// Fields that are on the fields table vs field_seasons table
const FIELD_LEVEL_KEYS = ['irrigation_type', 'row_direction', 'water_source', 'fuel_source'];
const SEASON_LEVEL_KEYS = ['crop', 'side_dress', 'hybrid_variety', 'planting_date'];
const LINK_FIELD_KEYS = ['billing_entity'];
const ALLOWED_KEYS = [...FIELD_LEVEL_KEYS, ...SEASON_LEVEL_KEYS, ...LINK_FIELD_KEYS];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, fieldId, fieldSeasonId, field: fieldName, value } = body;

    // Validate required fields
    if (!token || !fieldName) {
      return NextResponse.json({ error: 'token and field are required' }, { status: 400 });
    }

    if (!ALLOWED_KEYS.includes(fieldName)) {
      return NextResponse.json({ error: 'Invalid field name' }, { status: 400 });
    }

    // Validate token by checking operations table
    const opsResponse = await fetch(
      `${BASEROW_API_URL}/${OPERATIONS_TABLE_ID}/?user_field_names=true&filters=${encodeURIComponent(JSON.stringify({ filter_type: 'AND', filters: [{ type: 'equal', field: 'approval_token', value: token }] }))}`,
      {
        headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      }
    );

    if (!opsResponse.ok) {
      return NextResponse.json({ error: 'Failed to validate token' }, { status: 500 });
    }

    const opsData = await opsResponse.json();
    if (!opsData.results || opsData.results.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }

    // Determine which table to update
    const isLinkField = LINK_FIELD_KEYS.includes(fieldName);
    const isFieldLevel = FIELD_LEVEL_KEYS.includes(fieldName) || isLinkField;
    const tableId = isFieldLevel ? FIELDS_TABLE_ID : FIELD_SEASONS_TABLE_ID;
    const rowId = isFieldLevel ? fieldId : fieldSeasonId;

    if (!rowId) {
      return NextResponse.json({ error: 'Missing row ID' }, { status: 400 });
    }

    // Update the field in Baserow
    let updateBody: Record<string, unknown>;
    if (isLinkField) {
      // Link fields need array format: [id] or []
      const linkValue = value ? [value] : [];
      updateBody = {
        [fieldName]: linkValue,
        [fieldName.replace(/_/g, ' ')]: linkValue,
      };
    } else {
      updateBody = { [fieldName]: value || '' };
    }

    const response = await fetch(
      `${BASEROW_API_URL}/${tableId}/${rowId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow update error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to update' }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Field info API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
