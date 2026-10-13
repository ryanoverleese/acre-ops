import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const GET=withApiAuth(async(request,_context,current)=>{
 const installer=request.nextUrl.searchParams.get('installer');
 if(!installer) throw new DataError('installer required');
 if(current.kind==='crew'&&installer!==current.name) throw new DataError('Only your mileage is available',403);
 const date=request.nextUrl.searchParams.get('date');
 return NextResponse.json({logs:await getRows('mileage_logs',{filters:{installer,...(date?{date}:{})},orderBy:'-date'})});
});
export const POST=withApiAuth(async(request,_context,current)=>{
 const {installer_name,date,start_miles,end_miles,notes}=await request.json();
 if(!installer_name||!date) throw new DataError('installer_name and date required');
 if(current.kind==='crew'&&installer_name!==current.name) throw new DataError('Only your mileage can be saved',403);
 return NextResponse.json(await createRow('mileage_logs',{installer:installer_name,date,start_miles,end_miles,notes}),{status:201});
});
async function owner(id:number,current:import('@/lib/supabase/api').Actor) {
 const row=await getRow<{installer:string}>('mileage_logs',id);
 if(current.kind==='crew'&&row.installer!==current.name) throw new DataError('Only your mileage can be changed',403);
}
export const PATCH=withApiAuth(async(request,_context,current)=>{
 const id=positiveId(request.nextUrl.searchParams.get('id'));const body=await request.json();
 return NextResponse.json(await transaction(async()=>{
  await owner(id,current); const patch:Row={};
  for(const key of ['start_miles','end_miles','notes']) if(body[key]!==undefined) patch[key]=body[key];
  return updateRow('mileage_logs',id,patch);
 }));
});
export const DELETE=withApiAuth(async(request,_context,current)=>{
 const id=positiveId(request.nextUrl.searchParams.get('id'));
 await transaction(async()=>{await owner(id,current);await deleteRow('mileage_logs',id);});
 return NextResponse.json({ok:true});
});
