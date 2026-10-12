import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { query } from '@/lib/supabase/database';
export const GET=withApiAuth(async()=>{
 await query('SELECT 1');
 return NextResponse.json({ok:true,backend:'supabase',project:'junawlttpyztjlnbmvcb'});
});
