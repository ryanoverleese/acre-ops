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

    // Fetch relevant data in parallel
    const [fields, probes, fieldSeasons, repairs, contacts, operations] = await Promise.all([
      getFields(),
      getProbes(),
      getFieldSeasons(),
      getRepairs(),
      getContacts(),
      getOperations(),
    ]);

    // Build context about the data
    const dataContext = `
You are an AI assistant for Acre Ops, a farm management application. Answer questions about the farm data below.
Be concise and helpful. If you can't answer from the data provided, say so.

## Current Data Summary:
- ${fields.length} fields
- ${probes.length} probes
- ${fieldSeasons.length} field seasons
- ${repairs.length} repairs
- ${contacts.length} contacts
- ${operations.length} operations

## Fields Data:
${JSON.stringify(fields.map(f => ({
  id: f.id,
  name: f.name,
  acres: f.acres,
  pivot_acres: f.pivot_acres,
  irrigation_type: f.irrigation_type?.value,
  water_source: f.water_source?.value,
  fuel_source: f.fuel_source?.value,
  billing_entity: f.billing_entity?.[0]?.value,
})), null, 2)}

## Probes Data:
${JSON.stringify(probes.map(p => ({
  id: p.id,
  serial_number: p.serial_number,
  brand: p.brand?.value,
  status: p.status?.value,
  year_new: p.year_new,
  rack: p.rack?.value,
  rack_slot: p.rack_slot,
  billing_entity: p.billing_entity?.[0]?.value,
})), null, 2)}

## Field Seasons Data:
${JSON.stringify(fieldSeasons.map(fs => ({
  id: fs.id,
  field: fs.field?.[0]?.value,
  season: fs.season,
  crop: fs.crop?.value,
  service_type: fs.service_type?.value,
  probe_status: fs.probe_status?.value,
  install_date: fs.install_date,
})), null, 2)}

## Repairs Data:
${JSON.stringify(repairs.map(r => ({
  id: r.id,
  field_season: r.field_season?.[0]?.value,
  reported_at: r.reported_at,
  problem: r.problem,
  fix: r.fix,
  repaired_at: r.repaired_at,
})), null, 2)}

## Contacts Data:
${JSON.stringify(contacts.map(c => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  customer_type: c.customer_type?.value,
})), null, 2)}

## Operations Data:
${JSON.stringify(operations.map(o => ({
  id: o.id,
  name: o.name,
})), null, 2)}
`;

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
        { error: 'Failed to get AI response' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'No response generated';

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Ask API error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
