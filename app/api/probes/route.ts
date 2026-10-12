import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const GET = withApiAuth(async request => {
 const search=request.nextUrl.searchParams.get('search')||'';
 const page=positiveId(request.nextUrl.searchParams.get('page')||1);
 const rows=await getRows('probes',{search});
 const link=(p:number)=>`?${new URLSearchParams({page:String(p),search})}`;
 return NextResponse.json({results:rows.slice((page-1)*10,page*10),count:rows.length,next:rows.length>page*10?link(page+1):null,previous:page>1?link(page-1):null});
});
export const POST = withApiAuth(async request => {
 const body=await request.json();
 return NextResponse.json(await createRow('probes',{...body,serial_number:body.serial_number||null,date_created:new Date().toISOString().slice(0,10)}),{status:201});
});
