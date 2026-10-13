import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async request=>{
 const {items}=await request.json();
 if(!Array.isArray(items)||!items.length) throw new DataError('Items array is required');
 const results=await transaction(async()=>{
  const out=[];
  for(const item of items){
   const field=positiveId(item.field), season=positiveId(item.season);
   const existing=await getRows<{id:number}>('field_seasons',{filters:{field,season}});
   if(existing.length>1) throw new DataError('Duplicate field seasons need review',409);
   const row=existing[0]||await createRow<{id:number}>('field_seasons',{field:[field],season,...(item.crop?{crop:item.crop}:{}),...(item.service_type?{service_type:[positiveId(item.service_type)]}:{})});
   out.push({id:row.id,source_field_season_id:item.source_field_season_id});
  }
  return out;
 });
 return NextResponse.json({success:true,created:results.length,total:items.length,results},{status:201});
});
