import { NextRequest, NextResponse } from 'next/server';
import { getFields, getProbes, getFieldSeasons, getRepairs, getContacts, getOperations, getProbeAssignments } from '@/lib/baserow';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASEROW_API_TOKEN = process.env.BASEROW_API_TOKEN;

// Domain knowledge for the AI
const DOMAIN_KNOWLEDGE = `
ABOUT THIS APP:
Acre Insights Operation Center manages soil moisture probes for agricultural fields.
- Operations are farming companies/growers
- Fields belong to billing entities (who pay for services)
- Probes are soil moisture sensors installed in fields
- Field Seasons track what crop is planted each year and which probe is assigned
- Probe Assignments link probes to specific fields for a season
- Probes have a "rack" location when in storage (racks 1A-15B with slots 1-20)

RELATIONSHIPS:
- Probe → assigned to → Field Season → belongs to → Field → owned by → Billing Entity
- Probe status: "Installed", "In Storage", "Needs Repair", "Retired"
- When a probe serial number is mentioned, look it up in SPECIFIC PROBE FOUND section first
`;

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

    // Check if question contains a serial number (5-6 digit number)
    const serialMatch = question.match(/\b\d{5,6}\b/);
    let specificProbeContext = '';

    if (serialMatch && BASEROW_API_TOKEN) {
      try {
        // Look up the probe
        const probeResponse = await fetch(
          `https://api.baserow.io/api/database/rows/table/817299/?user_field_names=true&filter__serial_number__contains=${serialMatch[0]}`,
          {
            headers: {
              'Authorization': `Token ${BASEROW_API_TOKEN}`,
              'Content-Type': 'application/json',
            }
          }
        );
        const probeData = await probeResponse.json();

        if (probeData.results?.length > 0) {
          const probe = probeData.results[0];

          // Also look up probe assignments to find field info
          const assignmentResponse = await fetch(
            `https://api.baserow.io/api/database/rows/table/819350/?user_field_names=true&filter__probe__link_row_contains=${probe.id}`,
            {
              headers: {
                'Authorization': `Token ${BASEROW_API_TOKEN}`,
                'Content-Type': 'application/json',
              }
            }
          );
          const assignmentData = await assignmentResponse.json();
          const assignment = assignmentData.results?.[0];

          specificProbeContext = `SPECIFIC PROBE FOUND (Serial: ${serialMatch[0]}):\n${JSON.stringify({
            serial_number: probe.serial_number,
            rack: probe.rack?.value,
            rack_slot: probe.rack_slot,
            status: probe.status?.value,
            brand: probe.brand?.value,
            billing_entity: probe.billing_entity?.[0]?.value,
            contact: probe.contact?.[0]?.value,
            year_new: probe.year_new,
            notes: probe.notes,
            // Assignment info
            assigned_to_field: assignment?.field_season?.[0]?.value || 'Not currently assigned',
            install_date: assignment?.install_date || null,
            install_location: assignment?.install_lat && assignment?.install_lng
              ? `${assignment.install_lat}, ${assignment.install_lng}` : null,
          }, null, 2)}\n\n`;
        } else {
          specificProbeContext = `NOTE: No probe found with serial number ${serialMatch[0]}\n\n`;
        }
      } catch (probeError) {
        console.error('Probe lookup error:', probeError);
      }
    }

    // Fetch data with individual error handling
    let fields: Awaited<ReturnType<typeof getFields>> = [];
    let probes: Awaited<ReturnType<typeof getProbes>> = [];
    let fieldSeasons: Awaited<ReturnType<typeof getFieldSeasons>> = [];
    let repairs: Awaited<ReturnType<typeof getRepairs>> = [];
    let contacts: Awaited<ReturnType<typeof getContacts>> = [];
    let operations: Awaited<ReturnType<typeof getOperations>> = [];
    let probeAssignments: Awaited<ReturnType<typeof getProbeAssignments>> = [];

    try {
      [fields, probes, fieldSeasons, repairs, contacts, operations, probeAssignments] = await Promise.all([
        getFields().catch(() => []),
        getProbes().catch(() => []),
        getFieldSeasons().catch(() => []),
        getRepairs().catch(() => []),
        getContacts().catch(() => []),
        getOperations().catch(() => []),
        getProbeAssignments().catch(() => []),
      ]);
    } catch (fetchError) {
      console.error('Data fetch error:', fetchError);
    }

    // Build context about the data
    const dataContext = `You are an AI assistant for Acre Insights Operation Center, a farm management app.
${DOMAIN_KNOWLEDGE}

${specificProbeContext}DATA SUMMARY:
- ${fields.length} fields
- ${probes.length} probes
- ${fieldSeasons.length} field seasons
- ${probeAssignments.length} probe assignments
- ${repairs.length} repairs
- ${contacts.length} contacts
- ${operations.length} operations

FIELDS: ${JSON.stringify(fields.slice(0, 100).map(f => ({
  name: f.name,
  acres: f.acres,
  irrigation: f.irrigation_type?.value,
  entity: f.billing_entity?.[0]?.value,
})))}

PROBES: ${JSON.stringify(probes.slice(0, 100).map(p => ({
  serial: p.serial_number,
  status: p.status?.value,
  rack: p.rack?.value,
  slot: p.rack_slot,
  entity: p.billing_entity?.[0]?.value,
})))}

PROBE ASSIGNMENTS (probe→field links): ${JSON.stringify(probeAssignments.slice(0, 50).map(pa => ({
  probe: pa.probe?.[0]?.value,
  field_season: pa.field_season?.[0]?.value,
  status: pa.probe_status?.value,
  install_date: pa.install_date,
})))}

FIELD SEASONS: ${JSON.stringify(fieldSeasons.slice(0, 50).map(fs => ({
  field: fs.field?.[0]?.value,
  season: fs.season,
  crop: fs.crop?.value,
  probe: fs.probe?.[0]?.value,
  probe_status: fs.probe_status?.value,
})))}

REPAIRS: ${JSON.stringify(repairs.slice(0, 30).map(r => ({
  field: r.field_season?.[0]?.value,
  problem: r.problem,
  fix: r.fix,
  repaired: r.repaired_at,
})))}

CONTACTS: ${JSON.stringify(contacts.slice(0, 30).map(c => ({
  name: c.name,
  type: c.customer_type?.value,
  operations: c.operations?.map(o => o.value),
})))}

OPERATIONS: ${JSON.stringify(operations.map(o => o.name))}`;

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
