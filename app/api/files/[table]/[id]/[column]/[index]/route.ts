import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { query } from '@/lib/supabase/database';
import { positiveId, DataError, identifier } from '@/lib/supabase/registry';
import { signedDownload, type StorageFile } from '@/lib/supabase/storage';
export const GET=withApiAuth(async(_request,{params}:{params:Promise<{table:string;id:string;column:string;index:string}>},current)=>{
 const {table,id,column,index}=await params;
 const allowed:Record<string,string[]>={documents:['file'],probe_assignments:['removal_photo','install_photo_field_end','install_photo_extra']};
 if(!allowed[table]?.includes(column)) throw new DataError('File not found',404);
 if(current.kind==='crew'&&table!=='probe_assignments') throw new DataError('Not authorized',403);
 const rows=await query(`SELECT ${identifier(column)} AS files FROM public.${identifier(table)} WHERE id=$1`,[positiveId(id)]);
 const i=Number(index);
 if(!Number.isInteger(i)||i<0) throw new DataError('File not found',404);
 const ref=(rows[0]?.files as StorageFile[]|undefined)?.[i];
 if(!ref) throw new DataError('File not found',404);
 const response=NextResponse.redirect(await signedDownload(ref));
 response.headers.set('Cache-Control','private, no-store');
 return response;
});
