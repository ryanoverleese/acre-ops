import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

import { hash } from 'bcryptjs';
export const POST=withApiAuth(async request=>{
 const {email,password,name,role='installer'}=await request.json();
 if(typeof email!=='string'||typeof password!=='string'||password.length<8||typeof name!=='string'||!name.trim()) throw new DataError('Email, name, and a password of at least 8 characters are required');
 if(!['admin','installer'].includes(role)) throw new DataError('Invalid role');
 const password_hash=await hash(password,12);
 const user=await transaction(async()=>{
  if((await query('SELECT id FROM public.users WHERE lower(email)=lower($1)',[email.trim()])).length) throw new DataError('Email already exists',409);
  return createRow<{id:number;email:string;name:string}>('users',{email:email.trim().toLowerCase(),password_hash,name:name.trim(),role,active:true,created_at:new Date().toISOString()});
 });
 return NextResponse.json({id:user.id,email:user.email,name:user.name,role});
});
