import { NextResponse } from 'next/server';
import { getRow, getProbeAssignments, updateRow, type ProbeAssignment } from '@/lib/baserow';
import { recordProbeRemoval, RemovalError } from '@/lib/probe-removal';
import { withApiAuth } from '@/lib/supabase/api';
import { transaction, afterCommit } from '@/lib/supabase/database';
import { uploadFile, discardUpload, type StorageFile } from '@/lib/supabase/storage';
import { DataError, positiveId } from '@/lib/supabase/registry';
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
 * Await a bounded POST after the database commit, before the serverless response.
 * Env (set on Netlify — paste from Grok Bot routine panel acre-ops-removal-cropx-deactivate):
 *   REMOVAL_WEBHOOK_URL   — required to send; if unset, skip quietly (log once).
 *   REMOVAL_WEBHOOK_KEY or REMOVAL_WEBHOOK_AUTH — optional Authorization header
 *     (Bearer-prefixed unless the value already starts with Bearer/Token).
 *   REMOVAL_WEBHOOK_DRY_RUN — must be "true" on the branch deploy.
 *     This migration branch also forces dry_run=true as a fail-safe.
 */
async function notifyRemovalWebhook(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.REMOVAL_WEBHOOK_URL?.trim();
  if (!url) {
    if (!removalWebhookUrlMissingLogged) {
      removalWebhookUrlMissingLogged = true;
      console.warn('[removal] REMOVAL_WEBHOOK_URL unset — skipping CropX deactivate webhook');
    }
    return;
  }

  const dryRunEnv = process.env.REMOVAL_WEBHOOK_DRY_RUN;
  // This migration branch must never deactivate a live CropX installation.
  const dry_run = true;
  if (dryRunEnv !== 'true') console.warn('[removal] branch safety: dry run forced on');

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

  await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error('[removal] webhook non-OK', res.status);
      }
    })
    .catch((err) => {
      console.error('[removal] webhook failed');
    })
    .finally(() => clearTimeout(timeout));
}


export const dynamic='force-dynamic';
export const POST=withApiAuth(async(request,_context,current)=>{
 const form=await request.formData();const source=form.get('source')??'crew';
 if(source!=='crew'&&source!=='workflows') throw new DataError('Invalid removal source');
 if(source==='workflows'&&current.kind!=='staff') throw new DataError('Workflows requires staff access',403);
 const id=positiveId(form.get('probeAssignmentId'));
 const removedBy=String(form.get('removedBy')||'').trim();
 if(!removedBy) throw new DataError('Who pulled it is required');
 if(current.kind==='crew'&&removedBy!==current.name) throw new DataError('Removal must use the signed-in crew member',403);
 const existing=await getRow<ProbeAssignment>('probe_assignments',id);
 const photos=form.getAll('photo').filter((p):p is File=>p instanceof File&&p.size>0);
 const uploads=new Map<File,StorageFile|Error>();
 // Network uploads occur before the short DB transaction and are compensated on failure.
 if(!(existing.probe_status?.value==='Removed'&&existing.removal_date)) for(const photo of photos) {
  try{uploads.set(photo,await uploadFile(photo));}catch{uploads.set(photo,new Error('A removal photo could not be uploaded'));}
 }
 const discard=async()=>{for(const ref of uploads.values()) if(!(ref instanceof Error)) await discardUpload(ref).catch(()=>console.warn('Removal upload requires cleanup'));};
 try {
  const result=await transaction(()=>recordProbeRemoval({
   source,assignmentId:id,removedBy,removalDate:form.has('removalDate')?String(form.get('removalDate')):undefined,
   notes:String(form.get('removalNotes')||''),photos,
  },{
   getAssignment:assignment=>getRow<ProbeAssignment>('probe_assignments',assignment),
   listAssignments:()=>getProbeAssignments(),
   saveAssignment:(assignment,patch)=>updateRow<ProbeAssignment>('probe_assignments',assignment,patch),
   saveProbe:(probe,patch)=>updateRow('probes',probe,patch),
   uploadPhoto:async photo=>{const ref=uploads.get(photo);if(ref instanceof Error)throw ref;return ref||null;},
   notify:saved=>afterCommit(()=>notifyRemovalWebhook({
    serial:linkValue(saved.probe),assignment_id:saved.id,
    ...(linkValue(saved.field_season)?{field_name:linkValue(saved.field_season)}:{}),
    ...(linkId(saved.field_season)?{field_season_id:linkId(saved.field_season)}:{}),
    removed_by:saved.removed_by,removal_date:saved.removal_date,
   })),
  }));
  if(result.alreadyRemoved) await discard();
  return NextResponse.json(result);
 } catch(error) {
  await discard();
  if(error instanceof RemovalError) throw new DataError(error.message,error.status);
  throw error;
 }
});
