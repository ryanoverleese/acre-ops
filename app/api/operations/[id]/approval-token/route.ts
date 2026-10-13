import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

import { randomBytes } from 'node:crypto';
export const POST=withApiAuth(async(request,{params}:{params:Promise<{id:string}>})=>{
 const id=positiveId((await params).id); const body=await request.json().catch(()=>({}));
 return NextResponse.json(await transaction(async()=>{
  const op=await getRow<{approval_token:string}>('operations',id);
  if(op.approval_token&&!body.regenerate) return {token:op.approval_token,isNew:false};
  const token=randomBytes(24).toString('base64url');
  await updateRow('operations',id,{approval_token:token});
  return {token,isNew:true};
 }));
});
