import 'server-only';
import { randomUUID } from 'node:crypto';
import { assertProject } from './database';
import { BUCKET, PROJECT_URL, DataError } from './registry';

export interface StorageFile { bucket: string; path: string; name: string; size: number; mime: string }
function headers() {
  assertProject();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !(key.startsWith('sb_secret_') || key.split('.').length === 3)) throw new DataError('Private Storage key is not configured', 503);
  // New secret keys are API keys, not JWTs. Do not decode or put them in a bearer JWT.
  return {apikey:key,...(key.startsWith('sb_secret_') ? {} : {Authorization:`Bearer ${key}`})};
}
async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(`${PROJECT_URL}/storage/v1/${path}`,{...init,headers:{...headers(),...init.headers},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new DataError(`Private Storage request failed (${response.status})`,502);
    return response;
  } catch (error) { if (error instanceof DataError) throw error; throw new DataError('Private Storage is unavailable',502); }
}
const keyPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
export async function uploadFile(file: File): Promise<StorageFile> {
  if (!file.size || file.size > 50*1024*1024) throw new DataError('File must be between 1 byte and 50 MB');
  const ref = {bucket:BUCKET,path:`app/${randomUUID()}`,name:file.name,size:file.size,mime:file.type || 'application/octet-stream'};
  await request(`object/${BUCKET}/${keyPath(ref.path)}`,{method:'POST',headers:{'Content-Type':ref.mime,'x-upsert':'false'},body:await file.arrayBuffer()});
  return ref;
}
// Only newly created app objects may be cleaned up after a failed database save.
// Imported/shared references are retained even when a document row is deleted.
export async function discardUpload(ref: StorageFile) {
  if (ref.bucket !== BUCKET || !/^app\/[0-9a-f-]+$/.test(ref.path)) throw new DataError('Refusing to remove a non-app upload');
  await request(`object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[ref.path]})});
}
export async function signedDownload(ref: StorageFile): Promise<string> {
  if (ref.bucket !== BUCKET || !ref.path || ref.path.split('/').includes('..')) throw new DataError('Invalid file reference');
  const res = await request(`object/sign/${BUCKET}/${keyPath(ref.path)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60})});
  const data = await res.json();
  const signed = data.signedURL || data.signedUrl;
  if (typeof signed !== 'string') throw new DataError('Storage did not return a download URL',502);
  const url = new URL(signed.startsWith('/object/') ? `/storage/v1${signed}` : signed, `${PROJECT_URL}/storage/v1/`);
  if (url.origin !== PROJECT_URL || !url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`)) throw new DataError('Unexpected Storage download URL',502);
  url.searchParams.set('download',ref.name);
  return url.toString();
}
