import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

import { uploadFile, discardUpload, type StorageFile } from '@/lib/supabase/storage';
export const POST=withApiAuth(async(request,_context,current)=>{
 const form=await request.formData(); const name=String(form.get('name')||'').trim();
 if(!name) throw new DataError('Name is required');
 let file:StorageFile|undefined;
 try {
  const upload=form.get('file');
  if(upload instanceof File && upload.size) file=await uploadFile(upload);
  const row=await createRow('documents',{name,description:form.get('description')||null,uploaded_by:'name' in current?current.name:null,uploaded_at:form.get('date')||new Date().toISOString(),file:file?[file]:[]});
  return NextResponse.json(row);
 } catch(error) {
  if(file) await discardUpload(file).catch(()=>{console.warn('Document save failed; an app upload may require cleanup');});
  throw error;
 }
});
