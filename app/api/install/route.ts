import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { getRow, getRows, updateRow, type Row } from '@/lib/supabase/adapter';
import { transaction } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';
import { uploadFile, discardUpload, type StorageFile } from '@/lib/supabase/storage';
import type { ProbeAssignment } from '@/lib/types';
export const dynamic='force-dynamic';
export const POST=withApiAuth(async(request,_context,current)=>{
 const form=await request.formData();
 const id=positiveId(form.get('probeAssignmentId')); const installer=String(form.get('installer')||'').trim();
 const lat=Number(form.get('lat')),lng=Number(form.get('lng'));
 if(!installer||!form.has('lat')||!form.has('lng')||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw new DataError('Installer and valid GPS coordinates are required');
 if(current.kind==='crew'&&installer!==current.name) throw new DataError('Install must use the signed-in crew member',403);
 const existing=await getRow<ProbeAssignment>('probe_assignments',id);
 if(existing.probe_status?.value==='Installed') return NextResponse.json({success:true,probeAssignment:existing});
 const photos:Record<string,StorageFile>={};const photoErrors:string[]=[];
 for(const [formKey,column] of [['photoFieldEnd','install_photo_field_end'],['photoExtra','install_photo_extra']]) {
  const file=form.get(formKey);
  if(file instanceof File&&file.size) try {photos[column]=await uploadFile(file);} catch {photoErrors.push(formKey+': photo could not be uploaded');}
 }
 const cleanup=async()=>{for(const ref of Object.values(photos)) await discardUpload(ref).catch(()=>console.warn('Install upload requires cleanup'));};
 let used=false;
 try {
  const saved=await transaction(async()=>{
   const assignment=await getRow<ProbeAssignment>('probe_assignments',id);
   if(assignment.probe_status?.value==='Installed') return assignment;
   const season=assignment.field_season?.[0]?.id;
   if(!season || form.get('fieldSeasonId')&&positiveId(form.get('fieldSeasonId'))!==season) throw new DataError('Field season does not match the selected assignment',409);
   const probe=form.get('changedProbeId')?positiveId(form.get('changedProbeId')):assignment.probe?.[0]?.id;
   if(!probe) throw new DataError('Assign a physical probe before installing',409);
   const assignments=await getRows<ProbeAssignment>('probe_assignments',{filters:{probe}});
   if(assignments.some(a=>a.id!==id&&!a.removal_date&&(a.install_date||a.probe_status?.value==='Installed'))) throw new DataError('This probe already has an active installation',409);
   const patch:Row={installer,install_date:new Date().toISOString(),install_lat:lat,install_lng:lng,probe_status:'Installed',probe:[probe]};
   for(const [formKey,key] of [['cropxTelemetryId','cropx_telemetry_id'],['signalStrength','signal_strength'],['installNotes','install_notes'],['antennaType','antenna_type'],['pickupAccess','pickup_access']]) if(form.has(formKey)) patch[key]=form.get(formKey);
   for(const [key,ref] of Object.entries(photos)) patch[key]=[ref];
   const row=await updateRow<ProbeAssignment>('probe_assignments',id,patch);
   if(form.get('crop')) await updateRow('field_seasons',season,{crop:form.get('crop'),crop_confirmed:true});
   used=true;return row;
  });
  if(!used) await cleanup();
  return NextResponse.json({success:true,probeAssignment:saved,...(photoErrors.length?{photoErrors}:{})});
 }catch(error){await cleanup();throw error;}
});
