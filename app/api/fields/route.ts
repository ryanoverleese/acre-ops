import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async request=>{
 const body=await request.json();
 if(!body.name?.trim()||!body.billing_entity) throw new DataError('Field name and billing entity are required');
 const fieldData:Row={name:body.name,billing_entity:body.billing_entity};
 for(const key of ['acres','pivot_acres','lat','lng','plss_township','plss_range','plss_section','plss_description','notes','irrigation_type','row_direction']) if(body[key]!==undefined) fieldData[key]=body[key];
 const result=await transaction(async()=>{
  const field=await createRow<{id:number}>('fields',fieldData);
  const seasonData:Row={field:[field.id],season:Number(body.season)||new Date().getFullYear()};
  for(const key of ['crop','side_dress','logger_id','early_removal','hybrid_variety','ready_to_remove','planting_date']) if(body[key]!==undefined) seasonData[key]=body[key];
  if(body.service_type) seasonData.service_type=[positiveId(body.service_type)];
  const fieldSeason=await createRow<{id:number}>('field_seasons',seasonData);
  if(body.antenna_type||body.battery_type) await createRow('probe_assignments',{field_season:[fieldSeason.id],probe_number:1,...(body.antenna_type?{antenna_type:body.antenna_type}:{}),...(body.battery_type?{battery_type:body.battery_type}:{})});
  return {field,fieldSeason};
 });
 return NextResponse.json(result,{status:201});
});
