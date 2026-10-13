import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createRow, updateRow, getRow, getRows, deleteRow, type Row } from '@/lib/supabase/adapter';
import { transaction, query } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';

export const GET = withApiAuth(async request => {
 const invoice=request.nextUrl.searchParams.get('invoice_id');
 return NextResponse.json(await getRows('invoice_lines',invoice?{filters:{invoice:positiveId(invoice)}}:{}));
});
export const POST = withApiAuth(async request => {
 const {invoice_id,field_season_id,...data}=await request.json();
 return NextResponse.json(await createRow('invoice_lines',{...data,invoice:[positiveId(invoice_id)],field_season:[positiveId(field_season_id)]}),{status:201});
});
