import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

async function change(request: Request,params:Promise<{id:string}>,remove:boolean) {
 const id=positiveId((await params).id);
 const body=remove?{}:await request.json(); const operationId=positiveId(remove?new URL(request.url).searchParams.get('operationId'):body.operationId || body.operation_id);
 const saved=await transaction(async()=>{
   const contact=await getRow<{operations:{id:number}[]}>('contacts',id);
   const ids=(contact.operations||[]).map(o=>o.id).filter(i=>i!==operationId);
   if(!remove) ids.push(operationId);
   return updateRow('contacts',id,{operations:ids,...(!remove&&body.isMainContact!==undefined?{is_main_contact:body.isMainContact?'Yes':'No'}:{})});
 });
 return NextResponse.json(remove?{success:true}:saved);
}
export const POST=withApiAuth(async(request,{params}:{params:Promise<{id:string}>})=>change(request,params,false));
export const DELETE=withApiAuth(async(request,{params}:{params:Promise<{id:string}>})=>change(request,params,true));
