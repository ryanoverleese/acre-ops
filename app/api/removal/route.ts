import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getProbeAssignments, updateRow, type ProbeAssignment } from '@/lib/baserow';
import { recordProbeRemoval, RemovalError } from '@/lib/probe-removal';

/**
 * Record a probe coming OUT of the ground.
 *
 * The mirror of /api/install. Deliberately lighter: no serial scan, no GPS —
 * the probe is already tied to this assignment and its location was captured
 * going in. All the crew needs to enter is who pulled it, anything worth
 * noting, and a photo if it is worth one. The date and time are stamped here.
 *
 * Also used by Workflows uninstall. Repeated saves retain the original removal
 * details while allowing an interrupted probe inventory update to finish.
 */

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_FILE_UPLOAD_URL = 'https://api.baserow.io/api/user-files/upload-file/';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface BaserowFile {
  url: string;
  name: string;
  size: number;
  mime_type: string;
  is_image: boolean;
  image_width: number;
  image_height: number;
  uploaded_at: string;
}

async function uploadFileToBaserow(file: File): Promise<BaserowFile | null> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(BASEROW_FILE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Token ${BASEROW_TOKEN}` },
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Baserow upload ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

/** Pull display value / id from a Baserow link or select cell. */
function linkValue(v: unknown): string {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'value' in (v[0] as object)) {
    return String((v[0] as { value: unknown }).value ?? '');
  }
  if (v && typeof v === 'object' && 'value' in (v as object)) {
    return String((v as { value: unknown }).value ?? '');
  }
  return v == null ? '' : String(v);
}
function linkId(v: unknown): number | null {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'id' in (v[0] as object)) {
    const id = Number((v[0] as { id: number }).id);
    return Number.isFinite(id) ? id : null;
  }
  return null;
}

let removalWebhookUrlMissingLogged = false;

/**
 * Fire-and-forget POST to Grok Bot (CropX deactivate) after a removal save.
 * Env (set on Netlify — paste from Grok Bot routine panel acre-ops-removal-cropx-deactivate):
 *   REMOVAL_WEBHOOK_URL   — required to send; if unset, skip quietly (log once).
 *   REMOVAL_WEBHOOK_KEY or REMOVAL_WEBHOOK_AUTH — optional Authorization header
 *     (Bearer-prefixed unless the value already starts with Bearer/Token).
 *   REMOVAL_WEBHOOK_DRY_RUN — dry_run is true unless explicitly "false"
 *     (unset / "true" / "1" all keep dry-run ON for safe first ship).
 */
function notifyRemovalWebhook(payload: Record<string, unknown>): void {
  const url = process.env.REMOVAL_WEBHOOK_URL?.trim();
  if (!url) {
    if (!removalWebhookUrlMissingLogged) {
      removalWebhookUrlMissingLogged = true;
      console.warn('[removal] REMOVAL_WEBHOOK_URL unset — skipping CropX deactivate webhook');
    }
    return;
  }

  const dryRunEnv = process.env.REMOVAL_WEBHOOK_DRY_RUN;
  const dry_run = dryRunEnv !== 'false';

  const body = {
    ...payload,
    dry_run,
    source: 'acre-ops',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = (process.env.REMOVAL_WEBHOOK_KEY || process.env.REMOVAL_WEBHOOK_AUTH || '').trim();
  if (key) {
    headers.Authorization =
      /^Bearer\s/i.test(key) || /^Token\s/i.test(key) ? key : `Bearer ${key}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[removal] webhook non-OK', res.status, text.slice(0, 300));
      }
    })
    .catch((err) => {
      console.error('[removal] webhook failed', (err as Error).message || err);
    })
    .finally(() => clearTimeout(timeout));
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    // Existing crew clients omit source; Workflows must identify itself explicitly.
    const source = formData.get('source') ?? 'crew';
    if (source !== 'crew' && source !== 'workflows') {
      throw new RemovalError('Invalid removal source', 400);
    }
    const photos = formData.getAll('photo').filter((p): p is File => p instanceof File && p.size > 0);
    const result = await recordProbeRemoval({
      source,
      assignmentId: Number(formData.get('probeAssignmentId')),
      removedBy: String(formData.get('removedBy') ?? ''),
      removalDate: formData.has('removalDate') ? String(formData.get('removalDate')) : undefined,
      notes: String(formData.get('removalNotes') ?? ''),
      photos,
    }, {
      getAssignment: async (id) => {
        const response = await fetch(
          `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${id}/?user_field_names=true`,
          { headers: { Authorization: `Token ${BASEROW_TOKEN}` }, cache: 'no-store' },
        );
        if (response.status === 404) throw new RemovalError('That assignment was not found', 404);
        if (!response.ok) throw new RemovalError('Could not read that assignment. Try again.', 502);
        return response.json();
      },
      listAssignments: () => getProbeAssignments(),
      // updateRow invalidates each table's cache immediately after its PATCH.
      saveAssignment: (id, patch) => updateRow<ProbeAssignment>('probe_assignments', id, patch),
      saveProbe: (id, patch) => updateRow('probes', id, patch),
      uploadPhoto: uploadFileToBaserow,
      notify: (saved) => {
        const fieldSeasonId = linkId(saved.field_season);
        const fieldName = linkValue(saved.field_season);
        notifyRemovalWebhook({
          serial: linkValue(saved.probe),
          ...(fieldName ? { field_name: fieldName } : {}),
          ...(fieldSeasonId != null ? { field_season_id: fieldSeasonId } : {}),
          assignment_id: saved.id,
          removed_by: saved.removed_by,
          removal_date: saved.removal_date,
        });
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RemovalError ? error.message : 'Removal failed. Try again.' },
      { status: error instanceof RemovalError ? error.status : 500 },
    );
  }
}
