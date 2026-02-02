import { NextRequest, NextResponse } from 'next/server';
import { getFields, getProbes, getFieldSeasons, getRepairs, getContacts, getOperations } from '@/lib/baserow';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI features not configured. Add ANTHROPIC_API_KEY to your environment.' },
        { status: 500 }
      );
    }

    const { question } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a question' },
        { status: 400 }
      );
    }

    // Fetch data with individual error handling
    let fields: Awaited<ReturnType<typeof getFields>> = [];
    let probes: Awaited<ReturnType<typeof getProbes>> = [];
    let fieldSeasons: Awaited<ReturnType<typeof getFieldSeasons>> = [];
    let repairs: Awaited<ReturnType<typeof getRepairs>> = [];
    let contacts: Awaited<ReturnType<typeof getContacts>> = [];
    let operations: Awaited<ReturnType<typeof getOperations>> = [];

    try {
      [fields, probes, fieldSeasons, repairs, contacts, operations] = await Promise.all([
        getFields().catch(() => []),
        getProbes().catch(() => []),
        getFieldSeasons().catch(() => []),
        getRepairs().catch(() => []),
        getContacts().catch(() => []),
        getOperations().catch(() => []),
      ]);
    } catch (fetchError) {
      console.error('Data fetch error:', fetchError);
      // Continue with empty data rather than failing
    }

    // Build context about the data (keep it concise)
    const dataContext = `You are an AI assistant for Acre Insights Operation Center, a farm management app. Answer questions about the farm data below. Be concise.

Data Summary:
- ${fields.length} fields
- ${probes.length} probes
- ${fieldSeasons.length} field seasons
- ${repairs.length} repairs
- ${contacts.length} contacts
- ${operations.length} operations

Fields: ${JSON.stringify(fields.slice(0, 100).map(f => ({
  name: f.name,
  acres: f.acres,
  irrigation: f.irrigation_type?.value,
  entity: f.billing_entity?.[0]?.value,
})))}

Probes: ${JSON.stringify(probes.slice(0, 100).map(p => ({
  serial: p.serial_number,
  status: p.status?.value,
  rack: p.rack?.value,
})))}

Field Seasons: ${JSON.stringify(fieldSeasons.slice(0, 50).map(fs => ({
  field: fs.field?.[0]?.value,
  season: fs.season,
  crop: fs.crop?.value,
})))}

Repairs: ${JSON.stringify(repairs.slice(0, 30).map(r => ({
  problem: r.problem,
  fix: r.fix,
  repaired: r.repaired_at,
})))}

Contacts: ${JSON.stringify(contacts.slice(0, 30).map(c => ({
  name: c.name,
  type: c.customer_type?.value,
})))}

Operations: ${JSON.stringify(operations.map(o => o.name))}`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: dataContext,
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return NextResponse.json(
        { error: `AI error: ${response.status}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'No response generated';

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Ask API error:', error);
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
