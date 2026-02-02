import { NextRequest, NextResponse } from 'next/server';
import { getFields, getProbes, getFieldSeasons, getRepairs, getContacts, getOperations, getProbeAssignments } from '@/lib/baserow';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BASEROW_API_TOKEN = process.env.BASEROW_API_TOKEN;

// Domain knowledge, business rules, and examples for the AI
const DOMAIN_KNOWLEDGE = `
You are the AI assistant for Acre Ops, the probe management system for Acre Insights LLC, an agricultural consulting business in Nebraska.

Acre Insights serves over 44 farm operations with soil moisture monitoring, agronomic advice, and data management. You help Ryan (the owner and chief agronomist) and his team manage their probe inventory, track field assignments, and handle service records.

YOUR JOB:
- Answer questions about probe locations, rack assignments, and field deployments
- Help find probes by serial number, grower, field, or status
- Summarize service history and repairs
- Give quick counts and inventory checks

HOW TO RESPOND:
- Be direct and concise - no fluff
- If you find the data, lead with the answer (e.g., "Probe 408923 is in Rack 4, Slot 12")
- If data is missing or not found, say so clearly - never guess
- Use plain language, not corporate speak
- When listing multiple items, keep it scannable

YOU ARE NOT:
- A general farming advisor (don't give agronomic recommendations)
- A CropX or IrriMax expert (that's separate from this system)
- Able to make changes to the database (you can only read and report)

DATA CONTEXT:
- Probes have serial numbers, rack/slot locations, status, brand, and billing entity
- Fields have names, acres, irrigation type, and assigned growers
- Field seasons track which probes are deployed where each year
- Repairs log service history with problems and fixes

RELATIONSHIPS:
- Probe → assigned to → Field Season → belongs to → Field → owned by → Billing Entity
- Contacts can be linked to Operations (growers)

PROBE STATUSES:
- "Installed" = currently in a field
- "In Storage" = at the warehouse, should have rack/slot assigned
- "Needs Repair" = has an issue that needs fixing
- "Retired" = no longer in service

BUSINESS RULES:
- A probe "In Storage" should always have a rack and slot location
- Each field can have 1-2 probes per season
- Probes are installed in spring/early summer and removed in fall
- If someone asks about a probe without a rack, it might be installed in a field

EXAMPLE Q&A:
Q: "Where is probe 408923?"
A: If status is "In Storage": "Probe 408923 is in Rack 5A, Slot 12"
   If status is "Installed": "Probe 408923 is installed at Smith Farm North field"

Q: "How many probes does Johnson Farms have?"
A: Count probes where billing_entity matches, e.g., "Johnson Farms has 15 probes (12 installed, 3 in storage)"

Q: "What's planted at Miller field?"
A: Look up field season for current year, e.g., "Miller field has corn planted for 2026"

INSTRUCTIONS:
- If data is in SPECIFIC LOOKUP section, use that first
- When counting, give totals and breakdowns when relevant
- If you can't find something, say so clearly
`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI features not configured. Add ANTHROPIC_API_KEY to your environment.' },
        { status: 500 }
      );
    }

    const { question, history = [] } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a question' },
        { status: 400 }
      );
    }

    // Specific lookup context for detected entities
    let specificLookupContext = '';

    // Check if question contains a serial number (5-6 digit number)
    const serialMatch = question.match(/\b\d{5,6}\b/);

    if (serialMatch && BASEROW_API_TOKEN) {
      try {
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

          specificLookupContext += `SPECIFIC PROBE FOUND (Serial: ${serialMatch[0]}):\n${JSON.stringify({
            serial_number: probe.serial_number,
            rack: probe.rack?.value,
            rack_slot: probe.rack_slot,
            status: probe.status?.value,
            brand: probe.brand?.value,
            billing_entity: probe.billing_entity?.[0]?.value,
            contact: probe.contact?.[0]?.value,
            year_new: probe.year_new,
            notes: probe.notes,
            assigned_to_field: assignment?.field_season?.[0]?.value || 'Not currently assigned',
            install_date: assignment?.install_date || null,
          }, null, 2)}\n\n`;
        } else {
          specificLookupContext += `NOTE: No probe found with serial number ${serialMatch[0]}\n\n`;
        }
      } catch (probeError) {
        console.error('Probe lookup error:', probeError);
      }
    }

    // Fetch all data
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

    // Check for field name mentions
    const questionLower = question.toLowerCase();
    const matchedField = fields.find(f =>
      f.name && questionLower.includes(f.name.toLowerCase())
    );
    if (matchedField) {
      const fieldSeason = fieldSeasons.find(fs => fs.field?.[0]?.value === matchedField.name);
      specificLookupContext += `SPECIFIC FIELD FOUND (${matchedField.name}):\n${JSON.stringify({
        name: matchedField.name,
        acres: matchedField.acres,
        irrigation: matchedField.irrigation_type?.value,
        billing_entity: matchedField.billing_entity?.[0]?.value,
        current_crop: fieldSeason?.crop?.value,
        current_probe: fieldSeason?.probe?.[0]?.value,
        probe_status: fieldSeason?.probe_status?.value,
      }, null, 2)}\n\n`;
    }

    // Check for contact name mentions
    const matchedContact = contacts.find(c =>
      c.name && questionLower.includes(c.name.toLowerCase())
    );
    if (matchedContact) {
      // Get the contact's operations and find their probes
      const contactOperations = matchedContact.operations?.map(o => o.value) || [];
      const contactProbes = probes.filter(p => {
        const probeBillingEntity = p.billing_entity?.[0]?.value?.toLowerCase() || '';
        return contactOperations.some(op => probeBillingEntity.includes(op.toLowerCase()));
      });
      const contactFields = fields.filter(f => {
        const fieldBillingEntity = f.billing_entity?.[0]?.value?.toLowerCase() || '';
        return contactOperations.some(op => fieldBillingEntity.includes(op.toLowerCase()));
      });

      specificLookupContext += `SPECIFIC CONTACT FOUND (${matchedContact.name}):\n${JSON.stringify({
        name: matchedContact.name,
        email: matchedContact.email,
        phone: matchedContact.phone,
        type: matchedContact.customer_type?.value,
        operations: contactOperations,
        total_probes: contactProbes.length,
        probes: contactProbes.map(p => ({
          serial_number: p.serial_number,
          status: p.status?.value,
          rack: p.rack?.value,
          slot: p.rack_slot,
        })),
        probes_installed: contactProbes.filter(p => p.status?.value === 'Installed').length,
        probes_in_storage: contactProbes.filter(p => p.status?.value === 'In Storage').length,
        total_fields: contactFields.length,
        fields: contactFields.map(f => f.name),
      }, null, 2)}\n\n`;
    }

    // Check for operation name mentions
    const matchedOperation = operations.find(o =>
      o.name && questionLower.includes(o.name.toLowerCase())
    );
    if (matchedOperation) {
      const opProbes = probes.filter(p => p.billing_entity?.[0]?.value?.toLowerCase().includes(matchedOperation.name.toLowerCase()));
      const opFields = fields.filter(f => f.billing_entity?.[0]?.value?.toLowerCase().includes(matchedOperation.name.toLowerCase()));
      specificLookupContext += `SPECIFIC OPERATION FOUND (${matchedOperation.name}):\n${JSON.stringify({
        name: matchedOperation.name,
        total_probes: opProbes.length,
        probes: opProbes.map(p => ({
          serial_number: p.serial_number,
          status: p.status?.value,
          rack: p.rack?.value,
          slot: p.rack_slot,
        })),
        probes_installed: opProbes.filter(p => p.status?.value === 'Installed').length,
        probes_in_storage: opProbes.filter(p => p.status?.value === 'In Storage').length,
        total_fields: opFields.length,
        fields: opFields.map(f => f.name),
      }, null, 2)}\n\n`;
    }

    // Build context
    const dataContext = `You are an AI assistant for Acre Insights Operation Center, a farm management app.
${DOMAIN_KNOWLEDGE}

${specificLookupContext}DATA SUMMARY:
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

PROBE ASSIGNMENTS: ${JSON.stringify(probeAssignments.slice(0, 50).map(pa => ({
  probe: pa.probe?.[0]?.value,
  field_season: pa.field_season?.[0]?.value,
  status: pa.probe_status?.value,
})))}

FIELD SEASONS: ${JSON.stringify(fieldSeasons.slice(0, 50).map(fs => ({
  field: fs.field?.[0]?.value,
  season: fs.season,
  crop: fs.crop?.value,
  probe: fs.probe?.[0]?.value,
})))}

REPAIRS: ${JSON.stringify(repairs.slice(0, 30).map(r => ({
  field: r.field_season?.[0]?.value,
  problem: r.problem,
  repaired: r.repaired_at,
})))}

CONTACTS: ${JSON.stringify(contacts.slice(0, 30).map(c => ({
  name: c.name,
  type: c.customer_type?.value,
})))}

OPERATIONS: ${JSON.stringify(operations.map(o => o.name))}`;

    // Build messages with history for conversation memory
    const messages: Message[] = [];

    // Add conversation history (limit to last 10 exchanges to manage context size)
    const recentHistory = (history as Message[]).slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add current question
    messages.push({ role: 'user', content: question });

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
        messages,
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
