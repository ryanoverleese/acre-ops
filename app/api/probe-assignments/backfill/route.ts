import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
// Retired schema/one-shot maintenance endpoint. Never replay legacy row IDs.
export const GET=withApiAuth(async()=>NextResponse.json({error:'Legacy maintenance is disabled on the Supabase branch'},{status:410}));
export const POST=GET;
