import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

import { hash } from 'bcryptjs';
async function pinValue(pin:unknown) {
 if(pin==null||pin==='') return null;
 if(!/^\d{4,6}$/.test(String(pin))) throw new DataError('PIN must be 4–6 digits');
 return hash(String(pin),12);
}
export const GET=withApiAuth(async()=>NextResponse.json((await getRows<{id:number;name:string;pinSet:boolean}>('installers')).map(i=>({id:i.id,name:i.name||'',pinSet:i.pinSet}))));
export const POST=withApiAuth(async request=>{
 const {name,pin}=await request.json(); if(typeof name!=='string'||!name.trim()) throw new DataError('Name is required');
 const row=await createRow<{id:number;name:string;pinSet:boolean}>('installers',{name:name.trim(),pin:await pinValue(pin)});
 return NextResponse.json({id:row.id,name:row.name,pinSet:row.pinSet});
});
export const PATCH=withApiAuth(async request=>{
 const {id,pin}=await request.json();await updateRow('installers',positiveId(id),{pin:await pinValue(pin)});
 return NextResponse.json({ok:true});
});
export const DELETE=withApiAuth(async request=>{
 const {id}=await request.json();await deleteRow('installers',positiveId(id));return NextResponse.json({ok:true});
});
