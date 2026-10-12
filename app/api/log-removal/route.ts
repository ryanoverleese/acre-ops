import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async(request,_context,current)=>{
 const {serial,reason,date,fieldName,operation}=await request.json();
 if(!serial||!reason) throw new DataError('Serial and reason are required');
 const line=[date||new Date().toLocaleDateString('en-US'),`#${serial}`,reason,fieldName,operation].filter(Boolean).join(' – ');
 await transaction(async()=>{
  const rows=await getRows<{id:number;description:string}>('documents',{filters:{name:'Probe RMA Records'}});
  if(rows.length>1) throw new DataError('Multiple RMA notes exist; choose one before appending',409);
  const payload={description:rows[0]?.description?rows[0].description+'\n'+line:line,uploaded_at:new Date().toISOString()};
  if(rows[0]) await updateRow('documents',rows[0].id,payload);
  else await createRow('documents',{...payload,name:'Probe RMA Records',uploaded_by:'name' in current?current.name:'Staff'});
 });
 return NextResponse.json({ok:true});
});
