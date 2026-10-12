import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

import { assertCustomerField, operationForToken } from '@/lib/supabase/api';
const fieldKeys=['irrigation_type','row_direction','water_source','fuel_source','name','lat','lng'];
const seasonKeys=['crop','side_dress','hybrid_variety','planting_date'];
export const POST=withApiAuth(async request=>{
 const {token,fieldId,fieldSeasonId,field,value}=await request.json();
 if(![...fieldKeys,...seasonKeys,'billing_entity'].includes(field)) throw new DataError('Invalid field name');
 await transaction(async()=>{
  const operation=await assertCustomerField(token,fieldId,fieldSeasonId);
  if(field==='billing_entity'){
   const saved=await getRow<{billing_entity:{id:number}[]}>('fields',positiveId(fieldId));
   if(saved.billing_entity.length>1) throw new DataError('Shared billing must be reviewed by Acre staff; existing links were kept',409);
   const entity=positiveId(value);
   if(!(await query('SELECT 1 FROM public.contact_billing_entities cbe JOIN public.contact_operations co ON co.contact_id=cbe.contact_id WHERE cbe.billing_entity_id=$1 AND co.operation_id=$2 LIMIT 1',[entity,operation])).length) throw new DataError('Billing entity is outside this customer operation',403);
   await updateRow('fields',positiveId(fieldId),{billing_entity:[entity]});
  } else if(fieldKeys.includes(field)) await updateRow('fields',positiveId(fieldId),{[field]:value});
  else await updateRow('field_seasons',positiveId(fieldSeasonId),{[field]:value});
  await createRow('notifications',{operation:[operation],field:[positiveId(fieldId)],changed_field:field,new_value:typeof value==='object'?JSON.stringify(value):String(value??''),page_type:'field-info',read:false,created_on:new Date().toISOString()});
 });
 return NextResponse.json({success:true});
});
