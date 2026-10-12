import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async request=>{
 const {orderId,billingEntityId,probeCount,assignmentIds}=await request.json();
 const result=await transaction(async()=>{
  const order=await getRow<{billing_entity:{id:number}[];status:{value:string}}>('orders',positiveId(orderId));
  if(order.status?.value==='Fulfilled') return {success:true,updatedAssignments:0,totalOnOrder:0};
  const entity=order.billing_entity[0]?.id;
  if(!entity||entity!==positiveId(billingEntityId)) throw new DataError('Order billing entity does not match',409);
  const items=await getRows<{product:{value:string}[];quantity:number}>('order_items',{filters:{order_link:positiveId(orderId)}});
  const count=items.filter(item=>/probe|cropx/i.test(item.product[0]?.value||'')).reduce((sum,item)=>sum+Number(item.quantity||0),0);
  if(!Number.isSafeInteger(count)||count<0) throw new DataError('Order probe quantities must be whole non-negative numbers',409);
  if(probeCount!==undefined&&Number(probeCount)!==count) throw new DataError('The order quantities changed; refresh before fulfilling',409);
  const rows=await query('SELECT pa.id FROM public.probe_assignments pa JOIN public.assignment_probe_status_options status ON status.id=pa.probe_status_id JOIN public.field_seasons fs ON fs.id=pa.field_season_id WHERE status.value=$1 AND EXISTS (SELECT 1 FROM public.field_billing_entities fbe WHERE fbe.field_id=fs.field_id AND fbe.billing_entity_id=$2) ORDER BY pa.id',['On Order',entity]);
  const selected=assignmentIds===undefined?(count===0?[]:rows.map(row=>positiveId(row.id))):Array.isArray(assignmentIds)?assignmentIds.map(positiveId):[];
  if(selected.length!==count||new Set(selected).size!==count||selected.some((id:number)=>!rows.some(row=>Number(row.id)===id)))
    throw new DataError('On Order assignments do not exactly match this order. Review the assignments before fulfilling; no probes were changed.',409);
  for(const id of selected) await updateRow('probe_assignments',id,{probe_status:'Ready to Enter Serial'});
  await updateRow('orders',positiveId(orderId),{status:'Fulfilled'});
  return {success:true,updatedAssignments:count,totalOnOrder:rows.length};
 });
 return NextResponse.json(result);
});
