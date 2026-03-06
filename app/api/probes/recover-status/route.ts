import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Fetch all probes
async function fetchAllProbes(): Promise<{ id: number; status: { id: number; value: string } | null; serial_number: string | null }[]> {
  const tableId = TABLE_IDS.probes;
  let allProbes: any[] = [];
  let page = 1;
  while (true) {
    const url = `${BASEROW_API_URL}/${tableId}/?user_field_names=true&size=200&page=${page}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch probes page ${page}`);
    const data = await res.json();
    allProbes = allProbes.concat(data.results);
    if (!data.next) break;
    page++;
  }
  return allProbes;
}

// Try Baserow row history API to get previous status
async function getRowHistory(rowId: number): Promise<{ previousStatus: string | null }> {
  const tableId = TABLE_IDS.probes;
  try {
    // Baserow row history endpoint
    const url = `https://api.baserow.io/api/database/rows/table/${tableId}/${rowId}/history/?limit=10`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
    });
    if (!res.ok) return { previousStatus: null };
    const data = await res.json();
    // Look through history entries for a status change
    for (const entry of (data.results || [])) {
      const before = entry.before || {};
      const after = entry.after || {};
      // Check if this entry changed the status field
      if (before.status !== undefined || after.status !== undefined) {
        const prevStatus = before.status;
        if (prevStatus && typeof prevStatus === 'object' && prevStatus.value) {
          return { previousStatus: prevStatus.value };
        }
        if (typeof prevStatus === 'string') {
          return { previousStatus: prevStatus };
        }
        // Status was null/empty before
        return { previousStatus: null };
      }
    }
    return { previousStatus: null };
  } catch {
    return { previousStatus: null };
  }
}

export async function GET(request: NextRequest) {
  try {
    const apply = request.nextUrl.searchParams.get('apply') === 'true';

    // Step 1: Fetch all probes
    const probes = await fetchAllProbes();
    const inStockProbes = probes.filter(p => p.status?.value === 'In Stock');

    // Step 2: Try row history for a sample probe to see if the API works
    const sampleResult = await getRowHistory(inStockProbes[0]?.id);
    const historyAvailable = sampleResult.previousStatus !== null;

    if (!historyAvailable) {
      // Fall back to inference from data
      // Fetch probe assignments to identify installed probes
      const paTableId = TABLE_IDS.probe_assignments;
      let allAssignments: any[] = [];
      let page = 1;
      while (true) {
        const url = `${BASEROW_API_URL}/${paTableId}/?user_field_names=true&size=200&page=${page}`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
        });
        if (!res.ok) break;
        const data = await res.json();
        allAssignments = allAssignments.concat(data.results);
        if (!data.next) break;
        page++;
      }

      // Build set of probe IDs that have assignments (likely Installed)
      const currentYear = String(new Date().getFullYear());
      const assignedProbeIds = new Set<number>();
      const fsTableId = TABLE_IDS.field_seasons;
      // Get field seasons to check current year
      let fieldSeasons: any[] = [];
      page = 1;
      while (true) {
        const url = `${BASEROW_API_URL}/${fsTableId}/?user_field_names=true&size=200&page=${page}`;
        const res = await fetch(url, {
          headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
        });
        if (!res.ok) break;
        const data = await res.json();
        fieldSeasons = fieldSeasons.concat(data.results);
        if (!data.next) break;
        page++;
      }

      const currentSeasonFsIds = new Set(
        fieldSeasons
          .filter(fs => String(fs.season) === currentYear)
          .map(fs => fs.id)
      );

      allAssignments.forEach(pa => {
        const fsId = pa.field_season?.[0]?.id;
        const probeId = pa.probe?.[0]?.id;
        if (probeId && fsId && currentSeasonFsIds.has(fsId)) {
          assignedProbeIds.add(probeId);
        }
      });

      return NextResponse.json({
        historyAvailable: false,
        message: 'Row history API not available. Cannot automatically recover exact statuses. Showing inference-based suggestions.',
        totalProbes: probes.length,
        currentlyInStock: inStockProbes.length,
        inferredInstalled: inStockProbes.filter(p => assignedProbeIds.has(p.id)).map(p => ({
          id: p.id,
          serialNumber: p.serial_number,
          suggestedStatus: 'Installed',
        })),
        note: 'Only probes with current-season field assignments can be inferred as Installed. Other statuses (Assigned, On Order, RMA, Retired) cannot be determined from available data. Check Baserow UI row history manually for those.',
      });
    }

    // Step 3: Row history is available! Get previous status for all In Stock probes
    const recoveryPlan: { id: number; serialNumber: string | null; currentStatus: string; previousStatus: string }[] = [];

    for (const probe of inStockProbes) {
      const history = await getRowHistory(probe.id);
      if (history.previousStatus && history.previousStatus !== 'In Stock') {
        recoveryPlan.push({
          id: probe.id,
          serialNumber: probe.serial_number,
          currentStatus: 'In Stock',
          previousStatus: history.previousStatus,
        });
      }
    }

    if (!apply) {
      return NextResponse.json({
        historyAvailable: true,
        message: `Found ${recoveryPlan.length} probes to restore. Add ?apply=true to execute.`,
        totalProbes: probes.length,
        currentlyInStock: inStockProbes.length,
        toRestore: recoveryPlan.length,
        preview: recoveryPlan.slice(0, 50),
      });
    }

    // Step 4: Apply the recovery
    const tableId = TABLE_IDS.probes;
    const batchSize = 200;
    let restored = 0;
    for (let i = 0; i < recoveryPlan.length; i += batchSize) {
      const batch = recoveryPlan.slice(i, i + batchSize);
      const items = batch.map(p => ({ id: p.id, status: p.previousStatus }));
      const batchUrl = `${BASEROW_API_URL}/${tableId}/batch/?user_field_names=true`;
      const res = await fetch(batchUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        return NextResponse.json({ error: 'Batch restore failed', restored, detail: errorText }, { status: 500 });
      }
      restored += batch.length;
    }

    return NextResponse.json({
      success: true,
      restored,
      details: recoveryPlan,
    });
  } catch (error) {
    console.error('Recovery error:', error);
    return NextResponse.json({ error: 'Recovery failed', detail: String(error) }, { status: 500 });
  }
}
