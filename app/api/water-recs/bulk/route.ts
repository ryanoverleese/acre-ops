import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const POST=withApiAuth(async request=>{
 const {records,scopeFieldSeasons,reportType}=await request.json();
 if(!Array.isArray(records)) throw new DataError('records array is required');
 if(!records.length) return NextResponse.json({success:true,created:0,createdIds:[],deleted:0,failed:0,total:0});
 const date=records[0].date;
 if(records.some(r=>r.date!==date)) throw new DataError('Save one report date at a time');
 const types=[...new Set(records.map(r=>r.report_type || reportType || null))];
 if(types.length!==1 || reportType && types[0]!==reportType) throw new DataError('Save one exact report type at a time');
 const type=types[0]; const scope=(scopeFieldSeasons?.length?scopeFieldSeasons:records.map(r=>r.field_season)).map(positiveId);
 if(records.some(r=>!scope.includes(positiveId(r.field_season)))) throw new DataError('Recommendation is outside the submitted scope');
 if(new Set(records.map(r=>positiveId(r.field_season))).size!==records.length) throw new DataError('Duplicate fields in report');
 const result=await transaction(async()=>{
  const existing=await getRows<{id:number;field_season:{id:number}[]}>('water_recs',{filters:{date,report_type:type}});
  const keep:number[]=[];
  for(const rec of records){
   const fs=positiveId(rec.field_season);
   const prior=existing.find(r=>r.field_season[0]?.id===fs);
   const payload={field_season:[fs],date,recommendation:rec.recommendation||null,suggested_water_day:rec.suggested_water_day??null,report_type:type,...(rec.priority!==undefined?{priority:rec.priority}:{})};
   const saved=prior?await updateRow<{id:number}>('water_recs',prior.id,payload):await createRow<{id:number}>('water_recs',payload);
   keep.push(saved.id);
  }
  let deleted=0;
  for(const row of existing) if(scope.includes(row.field_season[0]?.id)&&!keep.includes(row.id)) {await deleteRow('water_recs',row.id);deleted++;}
  return {success:true,created:keep.length,createdIds:keep,deleted,failed:0,total:records.length};
 });
 return NextResponse.json(result);
});
