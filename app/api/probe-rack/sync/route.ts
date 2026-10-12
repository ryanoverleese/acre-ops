import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { getRows, updateRow } from '@/lib/supabase/adapter';
import { transaction } from '@/lib/supabase/database';
import type { Probe, ProbeRackSlot } from '@/lib/baserow';
export const POST=withApiAuth(async()=>{
 const result=await transaction(async()=>{
  const probes=await getRows<Probe>('probes'),slots=await getRows<ProbeRackSlot>('probe_rack');
  const occupied=new Set(slots.flatMap(s=>s.probe?.map(p=>p.id)||[]));
  let assigned=0,skipped=0,notFound=0;const errors:string[]=[];
  for(const probe of probes){
   if(occupied.has(probe.id)||!probe.rack?.value||!probe.rack_slot){skipped++;continue;}
   const choices=slots.filter(s=>s.rack===probe.rack!.value&&s.rack_slot===probe.rack_slot);
   if(!choices.length){notFound++;errors.push(`No slot for probe ${probe.serial_number}`);continue;}
   const target=choices.find(s=>!s.probe?.length);
   if(!target){skipped++;errors.push(`No empty slot for probe ${probe.serial_number}`);continue;}
   await updateRow('probe_rack',target.id,{probe:[probe.id]});target.probe=[{id:probe.id,value:probe.serial_number||''}];occupied.add(probe.id);assigned++;
  }
  return {assigned,skipped,notFound,errors};
 });
 return NextResponse.json(result);
});
