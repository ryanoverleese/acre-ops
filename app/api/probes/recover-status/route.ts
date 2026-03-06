import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getBaserowJwt } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

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

// Fetch row history using JWT auth (required — database tokens don't have access)
async function getRowHistory(jwt: string, rowId: number): Promise<any> {
  const tableId = TABLE_IDS.probes;
  const url = `https://api.baserow.io/api/database/rows/table/${tableId}/${rowId}/history/?limit=50`;
  const res = await fetch(url, {
    headers: { 'Authorization': `JWT ${jwt}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Extract the status BEFORE the bulk "In Stock" update from history entries
function findPreviousStatus(historyData: any): string | null {
  if (!historyData) return null;
  const entries = historyData.results || historyData || [];
  const entryList = Array.isArray(entries) ? entries : [];

  // Walk through history entries looking for the bulk update that set status to "In Stock"
  // The entry before that (or the "before" value in that entry) is what we want
  for (const entry of entryList) {
    // Try multiple response format possibilities
    const before = entry.before || entry.fields_changed?.before || {};
    const after = entry.after || entry.fields_changed?.after || {};

    // Check if this entry changed status TO "In Stock"
    const afterStatus = after.status || after.Status;
    const beforeStatus = before.status || before.Status;

    if (afterStatus) {
      const afterVal = typeof afterStatus === 'object' ? afterStatus.value : afterStatus;
      if (afterVal === 'In Stock' && beforeStatus) {
        const beforeVal = typeof beforeStatus === 'object' ? beforeStatus.value : beforeStatus;
        if (beforeVal && beforeVal !== 'In Stock') {
          return beforeVal;
        }
      }
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'debug';
    const apply = request.nextUrl.searchParams.get('apply') === 'true';

    // Get JWT token (required for row history API)
    const jwt = await getBaserowJwt();
    if (!jwt) {
      return NextResponse.json({
        error: 'Could not get JWT token. Ensure BASEROW_EMAIL and BASEROW_PASSWORD are set in environment variables.',
      }, { status: 401 });
    }

    // Debug mode: show raw API response for a sample probe
    if (mode === 'debug') {
      const probes = await fetchAllProbes();
      const sampleProbe = probes.find(p => p.serial_number) || probes[0];
      const historyData = await getRowHistory(jwt, sampleProbe.id);

      return NextResponse.json({
        message: 'Debug: raw Baserow row history API response (using JWT auth)',
        sampleProbeId: sampleProbe.id,
        sampleSerial: sampleProbe.serial_number,
        historyAvailable: historyData !== null,
        rawResponse: historyData,
      });
    }

    // Recover mode: find previous statuses and optionally restore
    if (mode === 'recover') {
      const probes = await fetchAllProbes();
      const inStockProbes = probes.filter(p => p.status?.value === 'In Stock');

      // Test with first probe
      const sampleHistory = await getRowHistory(jwt, inStockProbes[0]?.id);
      if (sampleHistory === null) {
        return NextResponse.json({
          error: 'Row history API returned error. Try ?mode=debug to see raw response.',
        });
      }

      // Process all In Stock probes
      const recoveryPlan: { id: number; serial: string | null; from: string; to: string }[] = [];
      const noHistory: { id: number; serial: string | null }[] = [];
      let processed = 0;

      for (const probe of inStockProbes) {
        const history = await getRowHistory(jwt, probe.id);
        processed++;
        const prevStatus = findPreviousStatus(history);
        if (prevStatus) {
          recoveryPlan.push({
            id: probe.id,
            serial: probe.serial_number,
            from: 'In Stock',
            to: prevStatus,
          });
        } else {
          noHistory.push({ id: probe.id, serial: probe.serial_number });
        }
      }

      if (!apply) {
        const summary: Record<string, number> = {};
        recoveryPlan.forEach(p => { summary[p.to] = (summary[p.to] || 0) + 1; });
        return NextResponse.json({
          message: `Preview: ${recoveryPlan.length} of ${inStockProbes.length} probes can be restored. ${noHistory.length} had no previous status or were already In Stock. Add &apply=true to execute.`,
          processed,
          summary,
          plan: recoveryPlan,
          noHistory,
        });
      }

      // Apply the recovery using database token (row updates work with database tokens)
      const tableId = TABLE_IDS.probes;
      const batchSize = 200;
      let restored = 0;
      for (let i = 0; i < recoveryPlan.length; i += batchSize) {
        const batch = recoveryPlan.slice(i, i + batchSize);
        const items = batch.map(p => ({ id: p.id, status: p.to }));
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

      return NextResponse.json({ success: true, restored, details: recoveryPlan });
    }

    return NextResponse.json({ error: 'Use ?mode=debug or ?mode=recover' });
  } catch (error) {
    console.error('Recovery error:', error);
    return NextResponse.json({ error: 'Recovery failed', detail: String(error) }, { status: 500 });
  }
}
