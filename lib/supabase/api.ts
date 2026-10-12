import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { CREW_COOKIE, readCrewSession } from '../crew-session';
import { createRow, updateRow, deleteRow, getRow, getRows, type Row, type FetchOptions } from './adapter';
import { DataError, positiveId } from './registry';
import { transaction, query } from './database';

export type Actor = {kind:'staff'|'crew';id:number;name:string;role:string} | {kind:'customer';token:string} | {kind:'public'};
export async function actor(request: Request): Promise<Actor> {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getRow<{id:number;name:string;active:boolean;role:{value:string}}>('users',positiveId(session.user.id));
    if (user.active) return {kind:user.role.value==='installer'?'crew':'staff',id:user.id,name:user.name,role:user.role.value};
  }
  const crew = await readCrewSession((await cookies()).get(CREW_COOKIE)?.value);
  if (crew) return {kind:'crew',id:crew.id,name:crew.name,role:'installer'};
  const token = request.headers.get('x-acre-customer-token');
  if (token) return {kind:'customer',token};
  return {kind:'public'};
}
const publicReads = new Set(['/api/ping','/api/pulled-today','/api/geocode','/api/elevation','/api/soil','/api/plss/lookup']);
const adminOnly = ['/api/backup','/api/debug','/api/register','/api/select-options','/api/installer-pins','/api/probe-rack/sync','/api/probe-assignments/backfill'];
const crewReads = ['/api/installer/','/api/select-options','/api/probes','/api/fields','/api/probe-rack','/api/mileage','/api/files/probe_assignments'];
const crewWrites = ['/api/install','/api/removal','/api/repairs','/api/probe-assignments','/api/mileage'];
function matches(path: string, prefix: string) { return path===prefix || path.startsWith(prefix.endsWith('/')?prefix:prefix+'/'); }
export function authorizeActor(current: Actor,path: string,method: string) {
  if (method==='GET' && publicReads.has(path) || path==='/api/installer-auth' || path==='/api/field-info') return;
  if (path==='/api/installer-pins' && method==='GET') return; // names + pinSet only
  if (current.kind==='customer' && /^\/api\/probe-assignments\/\d+$/.test(path) && method==='PATCH') return;
  if (current.kind==='customer' && path==='/api/notifications' && method==='POST') return;
  if (adminOnly.some(p=>matches(path,p)) && !(path==='/api/select-options' && method==='GET')) {
    if(current.kind!=='staff'||current.role!=='admin') throw new DataError('Administrator access required',403);
    return;
  }
  if (current.kind==='staff' && current.role==='admin') return;
  if (current.kind==='crew' && (method==='GET'?crewReads:crewWrites).some(p=>matches(path,p)) && (method!=='DELETE'||path==='/api/mileage')) return;
  throw new DataError('Sign in with an authorized account',current.kind==='public'?401:403);
}
export function errorResponse(error: unknown) {
  return NextResponse.json({error:error instanceof DataError?error.message:'The request could not be completed'}, {status:error instanceof DataError?error.status:500});
}
export function withApiAuth<C>(handler: (request: NextRequest,context: C,current: Actor)=>Promise<Response>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    try {
      if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
        const origin=request.headers.get('origin');
        if (origin) {
          const supplied = new URL(origin), internal = new URL(request.url);
          // Next/Netlify can reconstruct an internal URL with a different host.
          // Match the actual HTTP Host, not arbitrary x-forwarded-host input.
          const sameHost = supplied.host === request.headers.get('host') &&
            (supplied.protocol === internal.protocol || supplied.protocol === 'https:');
          if (origin !== internal.origin && !sameHost) throw new DataError('Cross-origin writes are not allowed',403);
        }
      }
      const current=await actor(request);
      authorizeActor(current,new URL(request.url).pathname,request.method);
      const path=new URL(request.url).pathname;
      if(request.method==='PATCH' && /^\/api\/probe-assignments\/\d+$/.test(path)) {
        await assertAssignmentWrite(current,positiveId(path.split('/').pop()),await request.clone().json());
      }
      if(current.kind==='crew' && request.method==='POST' && path.startsWith('/api/probe-assignments')) throw new DataError('Staff must prepare assignments',403);
      return await handler(request,context,current);
    } catch(error) { return errorResponse(error); }
  };
}
export async function operationForToken(token: unknown): Promise<number> {
  if(typeof token!=='string'||!token.trim()) throw new DataError('A customer token is required',403);
  const rows=await query('SELECT id FROM public.operations WHERE approval_token=$1',[token]);
  if(rows.length!==1) throw new DataError('Invalid customer token',403);
  return positiveId(rows[0].id);
}
export async function assertCustomerField(token: unknown,fieldId: unknown,seasonId?: unknown): Promise<number> {
  const op=await operationForToken(token); const field=positiveId(fieldId);
  const rows=await query('SELECT fbe.field_id FROM public.field_billing_entities fbe JOIN public.contact_billing_entities cbe ON cbe.billing_entity_id=fbe.billing_entity_id JOIN public.contact_operations co ON co.contact_id=cbe.contact_id WHERE fbe.field_id=$1 AND co.operation_id=$2 LIMIT 1',[field,op]);
  if(!rows.length) throw new DataError('This field does not belong to that customer link',403);
  if(seasonId!=null && !(await query('SELECT id FROM public.field_seasons WHERE id=$1 AND field_id=$2',[positiveId(seasonId),field])).length) throw new DataError('Field season does not match the field',403);
  return op;
}
export async function assertAssignmentWrite(current: Actor,id: number,data: Row) {
  if(current.kind==='customer') {
    if(Object.keys(data).some(k=>!['approval_status','approval_date','approval_notes','placement_lat','placement_lng'].includes(k))) throw new DataError('Customer link cannot change this attribute',403);
    const assignment=await getRow<{field_season:{id:number}[]}>('probe_assignments',id);
    const season=await getRow<{id:number;field:{id:number}[]}>('field_seasons',assignment.field_season[0]?.id);
    await assertCustomerField(current.token,season.field[0]?.id,season.id);
  } else if(current.kind==='crew') {
    if(Object.keys(data).some(k=>!['probe','install_notes','placement_notes','antenna_type','battery_type','grower_notified','pickup_access','cropx_telemetry_id','signal_strength'].includes(k))) throw new DataError('Use the install/removal action for status changes',403);
  }
}

export interface Resource {table:string;id?:number|string;options?:FetchOptions;limit?:number;page?:number;batch?:boolean}
// A local adapter response, NOT a REST proxy: symbolic tables + allowlisted data.
// Kept only to preserve existing route status/envelope handling during the switch.
export async function dataRequest(resource: Resource,init: {method?:string;body?:string} = {}): Promise<Response> {
  try {
    const {table}=resource; const method=init.method || 'GET'; const data=init.body?JSON.parse(init.body):{};
    if(resource.batch) {
      if(!Array.isArray(data.items)) throw new DataError('items array required');
      const items=await transaction(async()=> {
        const result=[];
        for(const item of data.items) {
          if(method==='POST') result.push(await createRow(table,item));
          else if(method==='PATCH') { const {id,...patch}=item; result.push(await updateRow(table,positiveId(id),patch)); }
          else throw new DataError('Unsupported batch method');
        }
        return result;
      });
      return Response.json({items});
    }
    if(method==='GET') {
      if(resource.id!=null) return Response.json(await getRow(table,positiveId(resource.id)));
      const rows=await getRows(table,resource.options); const size=resource.limit; const page=resource.page || 1;
      return Response.json({results:size?rows.slice((page-1)*size,page*size):rows,count:rows.length,next:size&&page*size<rows.length?`?page=${page+1}`:null,previous:page>1?`?page=${page-1}`:null});
    }
    if(method==='POST') return Response.json(await createRow(table,data),{status:201});
    if(resource.id==null) throw new DataError('Record ID required');
    if(method==='PATCH') return Response.json(await updateRow(table,positiveId(resource.id),data));
    if(method==='DELETE') {await deleteRow(table,positiveId(resource.id));return new Response(null,{status:204});}
    throw new DataError('Unsupported data action');
  } catch(error) { return errorResponse(error); }
}
