import { NextRequest, NextResponse } from 'next/server';
import { getFields, getProbes, getFieldSeasons, getContacts, getOperations, getProbeAssignments, getBillingEntities, updateRow, createRow } from '@/lib/baserow';
import type { FieldSeason, Probe, Repair, ProbeAssignment } from '@/lib/baserow';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Domain knowledge for the AI - generate dynamically to include current year
function getSystemPrompt() {
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  return `You are an assistant for Acre Ops, a soil moisture probe management system for Acre Insights in Nebraska. You help with field lookups, probe inventory, installation planning, and grower information.

The current year is ${currentYear}. When someone says "last year", they mean ${lastYear}. When they say "this year", they mean ${currentYear}.

Available tools:

- search_fields - Find fields by name or billing entity. Returns field info and season data with linked probes.
- search_field_seasons - Search field_seasons directly by field name or year. Best for finding what probe/crop was on a specific field in a specific year.
- search_probes - Find probes by serial number, status, brand, or billing entity.
- get_probe_counts - Get summary counts (how many by status, by brand, etc.)
- search_operations - Find operations with their linked contacts and billing entities.
- search_by_name - Searches across contacts, operations, and billing entities. Use this when looking up a grower, farm, or person by name.

How to behave:

1. Always use your tools to answer data questions. Never guess from memory. If search_fields returns no results, try search_by_name as a fallback - it searches across contacts, operations, and billing entities and may find what you're looking for.

2. When searching for fields, try MULTIPLE search strategies:
   - If user says "4G farms field 19", try searching for just "19" (the field number) since field names often start with numbers
   - Field names are often formatted as "19 - 4G" (number first, then operation)
   - Also try searching by the operation/billing entity name separately
   - If you find close matches but not an exact match, ask "Did you mean [field name]?" and show what you found

3. If the user challenges your answer, do NOT just agree with them. Re-run your query to verify, or stand by your answer and explain what you found.

4. If a query returns no results, say so clearly. Don't invent data.

5. Keep answers concise. Field crews need quick info, not paragraphs.

6. For navigation/directions, provide lat/lng coordinates and format the Google Maps link as markdown: [View on Google Maps](url)

7. You cannot search by geographic proximity or distance. If a user asks for fields near a city, within X miles of a location, or "what's nearby", explain that you can only search by name.

8. If you don't know something or the data isn't there, say so. Never make up information.

9. You have WRITE tools (update_field_season, update_probe, update_probe_assignment, create_repair). Before making changes, ALWAYS confirm with the user what you're about to do. After a successful write, confirm what was changed.

10. Search results include row IDs (field_season_id, probe_id, probe_assignment_id). ALWAYS use these IDs from search results when calling write tools - never guess IDs. If you don't have the ID, search first.

11. When updating records, use Baserow field names with spaces (e.g. "hybrid variety" not "hybrid_variety"). To clear a field, set it to null or empty string.`;
}

// Tool definitions for Claude
const TOOLS = [
  {
    name: "search_fields",
    description: "Find fields by name or billing entity. Returns field info including all season data with linked probes and row IDs (field_id, field_season_id, probe_id, probe_assignment_id) needed for write tools.",
    input_schema: {
      type: "object",
      properties: {
        name_contains: {
          type: "string",
          description: "Search for fields where name contains this text (case-insensitive)"
        },
        billing_entity_contains: {
          type: "string",
          description: "Search for fields where billing entity contains this text (case-insensitive)"
        },
        season: {
          type: "string",
          description: "Filter to a specific season/year (e.g., '2025', '2024')"
        }
      }
    }
  },
  {
    name: "search_probes",
    description: "Search for probes by serial number, status, brand, or billing entity.",
    input_schema: {
      type: "object",
      properties: {
        serial_number: {
          type: "string",
          description: "Exact or partial serial number to search for"
        },
        status: {
          type: "string",
          description: "Filter by status: 'Installed', 'In Storage', 'Needs Repair', 'Retired'"
        },
        brand: {
          type: "string",
          description: "Filter by brand (e.g., 'CropX', 'IrriMax')"
        },
        billing_entity_contains: {
          type: "string",
          description: "Search for probes where billing entity contains this text"
        }
      }
    }
  },
  {
    name: "get_probe_counts",
    description: "Get summary counts of probes by status and brand. Use this for questions like 'how many probes are installed?' or 'how many CropX probes?'",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "search_operations",
    description: "Search for operations/growers and see their linked billing entities and contacts.",
    input_schema: {
      type: "object",
      properties: {
        name_contains: {
          type: "string",
          description: "Search for operations where name contains this text"
        }
      }
    }
  },
  {
    name: "search_by_name",
    description: "Searches across contacts, operations, and billing entities. Use this when looking up a grower, farm, or person by name. Returns all related fields, probes, and linked entities.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name to search for across operations, contacts, and billing entities"
        }
      },
      required: ["name"]
    }
  },
  {
    name: "search_field_seasons",
    description: "Search field_seasons records directly. Returns field_season_id, crop, hybrid_variety, service type, probe info, probe_assignment_id, and installer details. Use the returned IDs for write tools.",
    input_schema: {
      type: "object",
      properties: {
        field_name_contains: {
          type: "string",
          description: "Search for field_seasons where the linked field name contains this text"
        },
        season: {
          type: "string",
          description: "Filter to a specific season/year (e.g., '2025', '2024')"
        }
      }
    }
  },
  // Write tools
  {
    name: "update_field_season",
    description: "Update a field_season record. Use to change crop, service_type, route_order, planned_installer, etc. ALWAYS confirm with user before calling.",
    input_schema: {
      type: "object",
      properties: {
        field_season_id: {
          type: "number",
          description: "The row ID of the field_season to update"
        },
        updates: {
          type: "object",
          description: "Fields to update. Use Baserow field names. For single_select, use option ID. For link_row, use array of row IDs."
        }
      },
      required: ["field_season_id", "updates"]
    }
  },
  {
    name: "update_probe",
    description: "Update a probe record. Use to change status, rack, rack_slot, notes, etc. ALWAYS confirm with user before calling.",
    input_schema: {
      type: "object",
      properties: {
        probe_id: {
          type: "number",
          description: "The row ID of the probe to update"
        },
        updates: {
          type: "object",
          description: "Fields to update. Use Baserow field names."
        }
      },
      required: ["probe_id", "updates"]
    }
  },
  {
    name: "update_probe_assignment",
    description: "Update a probe_assignment record. Use to change probe_status, installer, install_date, antenna_type, notes, etc. ALWAYS confirm with user before calling.",
    input_schema: {
      type: "object",
      properties: {
        probe_assignment_id: {
          type: "number",
          description: "The row ID of the probe_assignment to update"
        },
        updates: {
          type: "object",
          description: "Fields to update. Use Baserow field names."
        }
      },
      required: ["probe_assignment_id", "updates"]
    }
  },
  {
    name: "create_repair",
    description: "Create a new repair record. Use when a probe needs repair. ALWAYS confirm with user before calling.",
    input_schema: {
      type: "object",
      properties: {
        field_season_id: {
          type: "number",
          description: "The field_season row ID (link_row field)"
        },
        probe_assignment_id: {
          type: "number",
          description: "The probe_assignment row ID (link_row field)"
        },
        problem: {
          type: "string",
          description: "Description of the problem"
        }
      },
      required: ["problem"]
    }
  }
];

// Helper for fuzzy/partial matching - strips common suffixes and matches stems
function fuzzyMatch(searchTerm: string, targetString: string): boolean {
  if (!searchTerm || !targetString) return false;

  const search = searchTerm.toLowerCase().trim();
  const target = targetString.toLowerCase();

  // Direct match
  if (target.includes(search)) return true;

  // Strip common suffixes: 's, 'es, s, es
  const stems = [
    search,
    search.replace(/'s$/, ''),
    search.replace(/s$/, ''),
    search.replace(/es$/, ''),
  ];

  // Check if any stem matches
  for (const stem of stems) {
    if (stem.length >= 3 && target.includes(stem)) return true;
  }

  // Split into words - keep numbers and alphanumeric codes regardless of length
  const words = search.split(/\s+/).filter(w => {
    // Keep if 3+ chars, or if it's a number, or if it contains digits (like "4G")
    return w.length >= 3 || /^\d+$/.test(w) || /\d/.test(w);
  });
  for (const word of words) {
    if (target.includes(word)) return true;
    // Also try without trailing s (only for longer words)
    if (word.length >= 3) {
      const wordStem = word.replace(/s$/, '');
      if (wordStem.length >= 3 && target.includes(wordStem)) return true;
    }
  }

  return false;
}

// Tool execution functions
async function executeSearchFields(params: { name_contains?: string; billing_entity_contains?: string; season?: string }) {
  const [fields, fieldSeasons, probes, probeAssignments] = await Promise.all([
    getFields(),
    getFieldSeasons(),
    getProbes(),
    getProbeAssignments()
  ]);

  // Create probe lookup
  const probeMap = new Map(probes.map(p => [p.id, p]));

  // Build probe_assignment lookup by field_season_id (probe_number=1)
  const probe1ByFs = new Map<number, typeof probeAssignments[0]>();
  probeAssignments.forEach(pa => {
    const fsId = pa.field_season?.[0]?.id;
    if (fsId && pa.probe_number == 1) probe1ByFs.set(fsId, pa);
  });

  let results = fields;

  if (params.name_contains) {
    results = results.filter(f => fuzzyMatch(params.name_contains!, f.name || ''));
  }

  if (params.billing_entity_contains) {
    results = results.filter(f => fuzzyMatch(params.billing_entity_contains!, f.billing_entity?.[0]?.value || ''));
  }

  return results.slice(0, 50).map(f => {
    const seasons = fieldSeasons.filter(fs => {
      const fieldLink = fs.field?.[0];
      if (!fieldLink) return false;
      return fieldLink.id === f.id || fieldLink.value === f.name;
    });

    const relevantSeasons = params.season
      ? seasons.filter(s => String(s.season) === params.season)
      : seasons;

    // Get probe info from probe_assignments
    const seasonData = relevantSeasons.map(s => {
      const pa = probe1ByFs.get(s.id);
      const probeLink = pa?.probe?.[0];
      const probe = probeLink ? probeMap.get(probeLink.id) : null;
      return {
        field_season_id: s.id,
        season: s.season,
        crop: s.crop?.value,
        hybrid_variety: s.hybrid_variety,
        service_type: s.service_type?.[0]?.value,
        probe_status: pa?.probe_status?.value || 'Unassigned',
        probe: probe ? `#${probe.serial_number}` : null,
        probe_id: probe?.id || null,
        probe_assignment_id: pa?.id || null,
        installer: pa?.installer,
        install_date: pa?.install_date
      };
    });

    return {
      field_id: f.id,
      field_name: f.name,
      acres: f.acres,
      lat: f.lat,
      lng: f.lng,
      irrigation_type: f.irrigation_type?.value,
      billing_entity: f.billing_entity?.[0]?.value,
      seasons: seasonData,
      google_maps_link: f.lat && f.lng ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : null
    };
  });
}

async function executeSearchProbes(params: { serial_number?: string; status?: string; brand?: string; billing_entity_contains?: string }) {
  const probes = await getProbes();
  let results = probes;

  if (params.serial_number) {
    const search = params.serial_number.toLowerCase();
    results = results.filter(p => p.serial_number?.toLowerCase().includes(search));
  }

  if (params.status) {
    results = results.filter(p => p.status?.value === params.status);
  }

  if (params.brand) {
    const search = params.brand.toLowerCase();
    results = results.filter(p => p.brand?.value?.toLowerCase().includes(search));
  }

  if (params.billing_entity_contains) {
    results = results.filter(p => fuzzyMatch(params.billing_entity_contains!, p.billing_entity?.[0]?.value || ''));
  }

  return {
    total_found: results.length,
    probes: results.slice(0, 50).map(p => ({
      probe_id: p.id,
      serial_number: p.serial_number,
      brand: p.brand?.value,
      status: p.status?.value,
      rack: p.rack?.value,
      rack_slot: p.rack_slot,
      billing_entity: p.billing_entity?.[0]?.value,
      year_new: p.year_new
    }))
  };
}

async function executeGetProbeCounts() {
  const probes = await getProbes();

  const byStatus: Record<string, number> = {};
  const byBrand: Record<string, number> = {};

  probes.forEach(p => {
    const status = p.status?.value || 'Unknown';
    const brand = p.brand?.value || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    byBrand[brand] = (byBrand[brand] || 0) + 1;
  });

  return {
    total_probes: probes.length,
    by_status: byStatus,
    by_brand: byBrand
  };
}

async function executeSearchOperations(params: { name_contains?: string }) {
  const [operations, contacts, billingEntities] = await Promise.all([
    getOperations(),
    getContacts(),
    getBillingEntities()
  ]);

  let results = operations;
  if (params.name_contains) {
    const search = params.name_contains.toLowerCase();
    results = results.filter(o => o.name?.toLowerCase().includes(search));
  }

  return results.slice(0, 20).map(op => {
    // Find contacts linked to this operation
    const opContacts = contacts.filter(c =>
      c.operations?.some(o => o.value.toLowerCase() === op.name?.toLowerCase())
    );
    // Get billing entities from contacts
    const linkedBEs = new Set<string>();
    opContacts.forEach(c => {
      c.billing_entity?.forEach(be => linkedBEs.add(be.value));
    });

    return {
      operation_name: op.name,
      contacts: opContacts.map(c => c.name),
      billing_entities: Array.from(linkedBEs)
    };
  });
}

async function executeSearchFieldSeasons(params: { field_name_contains?: string; season?: string }) {
  const [fieldSeasons, probes, probeAssignments] = await Promise.all([
    getFieldSeasons(),
    getProbes(),
    getProbeAssignments()
  ]);

  const probeMap = new Map(probes.map(p => [p.id, p]));

  // Build probe_assignment lookup by field_season_id (probe_number=1)
  const probe1ByFs = new Map<number, typeof probeAssignments[0]>();
  probeAssignments.forEach(pa => {
    const fsId = pa.field_season?.[0]?.id;
    if (fsId && pa.probe_number == 1) probe1ByFs.set(fsId, pa);
  });

  let results = fieldSeasons;

  if (params.field_name_contains) {
    results = results.filter(fs => {
      const fieldName = fs.field?.[0]?.value || '';
      return fuzzyMatch(params.field_name_contains!, fieldName);
    });
  }

  if (params.season) {
    results = results.filter(fs => String(fs.season) === params.season);
  }

  return {
    total_found: results.length,
    field_seasons: results.slice(0, 50).map(fs => {
      const pa = probe1ByFs.get(fs.id);
      const probeLink = pa?.probe?.[0];
      const probe = probeLink ? probeMap.get(probeLink.id) : null;
      return {
        field_season_id: fs.id,
        field_name: fs.field?.[0]?.value || 'Unknown',
        season: fs.season,
        crop: fs.crop?.value,
        hybrid_variety: fs.hybrid_variety,
        service_type: fs.service_type?.[0]?.value,
        probe_status: pa?.probe_status?.value || 'Unassigned',
        probe: probe ? `#${probe.serial_number}` : null,
        probe_id: probe?.id || null,
        probe_assignment_id: pa?.id || null,
        installer: pa?.installer,
        install_date: pa?.install_date,
        antenna_type: pa?.antenna_type?.value
      };
    })
  };
}

async function executeSearchByName(params: { name: string }) {
  const searchTerm = params.name;

  const [fields, probes, operations, contacts, billingEntities] = await Promise.all([
    getFields(),
    getProbes(),
    getOperations(),
    getContacts(),
    getBillingEntities()
  ]);

  // Find matching billing entities using fuzzy match
  const matchedBEs: string[] = billingEntities
    .filter(be => fuzzyMatch(searchTerm, be.name || ''))
    .map(be => be.name!);

  // Find matching operations using fuzzy match
  const matchedOps = operations.filter(op => fuzzyMatch(searchTerm, op.name || ''));

  // Find matching contacts and their billing entities using fuzzy match
  const matchedContacts = contacts.filter(c => fuzzyMatch(searchTerm, c.name || ''));
  matchedContacts.forEach(c => {
    c.billing_entity?.forEach(be => {
      if (!matchedBEs.includes(be.value)) matchedBEs.push(be.value);
    });
  });

  // Also get BEs from matched operations via contacts
  matchedOps.forEach(op => {
    const opContacts = contacts.filter(c =>
      c.operations?.some(o => o.value.toLowerCase() === op.name?.toLowerCase())
    );
    opContacts.forEach(c => {
      c.billing_entity?.forEach(be => {
        if (!matchedBEs.includes(be.value)) matchedBEs.push(be.value);
      });
    });
  });

  // Find fields for these billing entities
  const growerFields = fields.filter(f => {
    const fbe = f.billing_entity?.[0]?.value || '';
    return matchedBEs.some(be => fbe.toLowerCase().includes(be.toLowerCase()));
  });

  // Find probes for these billing entities
  const growerProbes = probes.filter(p => {
    const pbe = p.billing_entity?.[0]?.value || '';
    return matchedBEs.some(be => pbe.toLowerCase().includes(be.toLowerCase()));
  });

  return {
    search_term: params.name,
    matched_operations: matchedOps.map(o => o.name),
    matched_billing_entities: matchedBEs,
    matched_contacts: matchedContacts.map(c => c.name),
    fields: growerFields.map(f => ({
      field_name: f.name,
      acres: f.acres,
      lat: f.lat,
      lng: f.lng,
      irrigation_type: f.irrigation_type?.value,
      billing_entity: f.billing_entity?.[0]?.value,
      google_maps_link: f.lat && f.lng ? `https://www.google.com/maps?q=${f.lat},${f.lng}` : null
    })),
    probes: {
      total: growerProbes.length,
      by_status: growerProbes.reduce((acc, p) => {
        const status = p.status?.value || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      list: growerProbes.slice(0, 30).map(p => ({
        serial_number: p.serial_number,
        status: p.status?.value,
        rack: p.rack?.value,
        slot: p.rack_slot
      }))
    }
  };
}

// Write tool execution functions
async function executeUpdateFieldSeason(params: { field_season_id: number; updates: Record<string, unknown> }) {
  try {
    const result = await updateRow<FieldSeason>('field_seasons', params.field_season_id, params.updates);
    return { success: true, updated_id: result.id, field: result.field?.[0]?.value, season: result.season };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function executeUpdateProbe(params: { probe_id: number; updates: Record<string, unknown> }) {
  try {
    const result = await updateRow<Probe>('probes', params.probe_id, params.updates);
    return { success: true, updated_id: result.id, serial_number: result.serial_number, status: result.status?.value };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function executeUpdateProbeAssignment(params: { probe_assignment_id: number; updates: Record<string, unknown> }) {
  try {
    const result = await updateRow<ProbeAssignment>('probe_assignments', params.probe_assignment_id, params.updates);
    return { success: true, updated_id: result.id, probe_status: result.probe_status?.value, installer: result.installer };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function executeCreateRepair(params: { field_season_id?: number; probe_assignment_id?: number; problem: string }) {
  try {
    const data: Record<string, unknown> = {
      problem: params.problem,
      reported_at: new Date().toISOString().split('T')[0],
    };
    if (params.field_season_id) data.field_season = [params.field_season_id];
    if (params.probe_assignment_id) data.probe_assignment = [params.probe_assignment_id];
    const result = await createRow<Repair>('repairs', data);
    return { success: true, created_id: result.id, problem: result.problem };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Execute a tool call
async function executeTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case 'search_fields':
      return await executeSearchFields(input as { name_contains?: string; billing_entity_contains?: string });
    case 'search_probes':
      return await executeSearchProbes(input as { serial_number?: string; status?: string; brand?: string; billing_entity_contains?: string });
    case 'get_probe_counts':
      return await executeGetProbeCounts();
    case 'search_operations':
      return await executeSearchOperations(input as { name_contains?: string });
    case 'search_by_name':
      return await executeSearchByName(input as { name: string });
    case 'search_field_seasons':
      return await executeSearchFieldSeasons(input as { field_name_contains?: string; season?: string });
    case 'update_field_season':
      return await executeUpdateFieldSeason(input as { field_season_id: number; updates: Record<string, unknown> });
    case 'update_probe':
      return await executeUpdateProbe(input as { probe_id: number; updates: Record<string, unknown> });
    case 'update_probe_assignment':
      return await executeUpdateProbeAssignment(input as { probe_assignment_id: number; updates: Record<string, unknown> });
    case 'create_repair':
      return await executeCreateRepair(input as { field_season_id?: number; probe_assignment_id?: number; problem: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

interface Message {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;
}

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI features not configured. Add ANTHROPIC_API_KEY to your environment.' },
        { status: 500 }
      );
    }

    const { question, history = [], images = [] } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Build messages array with conversation history
    const messages = [
      ...history.slice(-10).map((msg: Message) => ({
        role: msg.role,
        content: msg.content
      })),
    ];

    // Build user message content - may include images
    if (images.length > 0) {
      const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];
      for (const img of images) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.media_type,
            data: img.data,
          },
        });
      }
      contentBlocks.push({ type: 'text', text: question });
      messages.push({ role: 'user', content: contentBlocks });
    } else {
      messages.push({ role: 'user', content: question });
    }

    // Initial API call with tools
    let response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: getSystemPrompt(),
        tools: TOOLS,
        messages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Claude API error:', error);
      return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
    }

    let data = await response.json();

    // Handle tool use loop (max 5 iterations to prevent infinite loops)
    let iterations = 0;
    while (data.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;

      // Find tool use blocks in the response
      const toolUseBlocks = data.content.filter((block: { type: string }) => block.type === 'tool_use');

      // Execute each tool and collect results
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse: { id: string; name: string; input: Record<string, unknown> }) => {
          const result = await executeTool(toolUse.name, toolUse.input);
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result, null, 2)
          };
        })
      );

      // Continue conversation with tool results
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: getSystemPrompt(),
          tools: TOOLS,
          messages: [
            ...messages,
            { role: 'assistant', content: data.content },
            { role: 'user', content: toolResults }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Claude API error on tool result:', error);
        return NextResponse.json({ error: 'Failed to get AI response' }, { status: 500 });
      }

      data = await response.json();
    }

    // Extract text response
    const textBlock = data.content.find((block: { type: string }) => block.type === 'text');
    const answer = textBlock?.text || 'No response generated';

    return NextResponse.json({ answer });

  } catch (error) {
    console.error('Ask API error:', error);
    return NextResponse.json(
      { error: 'Failed to process question' },
      { status: 500 }
    );
  }
}
