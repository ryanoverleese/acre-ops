import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, bustTableCache } from '@/lib/baserow';

/**
 * Record a probe coming OUT of the ground.
 *
 * The mirror of /api/install. Deliberately lighter: no serial scan, no GPS —
 * the probe is already tied to this assignment and its location was captured
 * going in. All the crew needs to enter is who pulled it, anything worth
 * noting, and a photo if it is worth one. The date and time are stamped here.
 *
 * Idempotent the same way install is: a row already marked Removed returns
 * success rather than overwriting an earlier crew's record with a later one.
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

    const probeAssignmentId = parseInt(formData.get('probeAssignmentId') as string, 10);
    const removedBy = (formData.get('removedBy') as string | null)?.trim();
    const removalNotes = (formData.get('removalNotes') as string | null)?.trim() || '';
    const photos = formData.getAll('photo').filter((p): p is File => p instanceof File && p.size > 0);

    if (!Number.isFinite(probeAssignmentId)) {
      return NextResponse.json({ error: 'Invalid probe assignment ID' }, { status: 400 });
    }
    if (!removedBy) {
      return NextResponse.json({ error: 'Who pulled it is required' }, { status: 400 });
    }

    // Already pulled? Say so and change nothing. A second tap in a dead-signal
    // field must not restamp the date with a later crew's time.
    const existingRes = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${probeAssignmentId}/?user_field_names=true`,
      { headers: { Authorization: `Token ${BASEROW_TOKEN}` } },
    );
    if (!existingRes.ok) {
      return NextResponse.json({ error: 'That assignment was not found' }, { status: 404 });
    }
    const existing = await existingRes.json();
    const statusValue = typeof existing.probe_status === 'object' && existing.probe_status
      ? existing.probe_status.value
      : existing.probe_status;
    if (statusValue === 'Removed' && existing.removal_date) {
      return NextResponse.json({
        ok: true, alreadyRemoved: true,
        removal_date: existing.removal_date,
        message: 'Already recorded as removed.',
      });
    }

    // Photos are optional — a failed upload must not lose the removal itself,
    // which is the fact that actually matters. Report it and carry on.
    const uploaded: BaserowFile[] = [];
    const photoErrors: string[] = [];
    for (const photo of photos) {
      try {
        const file = await uploadFileToBaserow(photo);
        if (file) uploaded.push(file);
      } catch (e) {
        photoErrors.push((e as Error).message);
      }
    }

    const update: Record<string, unknown> = {
      probe_status: 'Removed',
      // Baserow's removal_date column is date-only and rejects ISO timestamps.
      removal_date: new Date().toISOString().slice(0, 10),
      removed_by: removedBy,
    };
    if (removalNotes) update.removal_notes = removalNotes;
    if (uploaded.length > 0) update.removal_photo = uploaded.map((f) => ({ name: f.name }));

    const patchRes = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${probeAssignmentId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update),
      },
    );
    if (!patchRes.ok) {
      const detail = await patchRes.text();
      return NextResponse.json(
        { error: `Could not save the removal: ${detail}` },
        { status: 502 },
      );
    }
    const saved = await patchRes.json();
    bustTableCache('probe_assignments');

    // Notify Grok Bot for CropX deactivate (fire-and-forget; never fails the installer).
    // See notifyRemovalWebhook for REMOVAL_WEBHOOK_URL / _KEY|_AUTH / _DRY_RUN.
    const serial = linkValue(existing.probe) || linkValue(saved.probe);
    const fieldSeasonId = linkId(existing.field_season) ?? linkId(saved.field_season);
    const fieldName = linkValue(existing.field_season) || linkValue(saved.field_season);
    notifyRemovalWebhook({
      serial,
      ...(fieldName ? { field_name: fieldName } : {}),
      ...(fieldSeasonId != null ? { field_season_id: fieldSeasonId } : {}),
      assignment_id: probeAssignmentId,
      removed_by: removedBy,
      removal_date: saved.removal_date || update.removal_date,
    });

    return NextResponse.json({
      ok: true,
      removal_date: saved.removal_date,
      photos: uploaded.length,
      photoErrors: photoErrors.length ? photoErrors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Removal failed' },
      { status: 500 },
    );
  }
}
