import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async request=>{
 const {items}=await request.json();
 if(!Array.isArray(items)||!items.length) throw new DataError('Items array is required');
 const created=await transaction(async()=>{
  let count=0;
  for(const item of items){
   const season=positiveId(item.field_season), number=positiveId(item.probe_number??1);
   const existing=await getRows('probe_assignments',{filters:{field_season:season,probe_number:number}});
   if(existing.length>1) throw new DataError('Duplicate probe numbers need review',409);
   if(existing.length) continue;
   const data:Row={field_season:[season],probe_number:number,probe_status:'Unassigned'};
   for(const key of ['placement_lat','placement_lng','elevation','soil_type','placement_notes']) if(item[key]!==undefined) data[key]=item[key];
   await createRow('probe_assignments',data);count++;
  }
  return count;
 });
 return NextResponse.json({created},{status:201});
});
