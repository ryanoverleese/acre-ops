import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { getAllSelectOptions, saveSelectOptions } from '@/lib/supabase/adapter';
export const GET = withApiAuth(async () => NextResponse.json(await getAllSelectOptions(['fields','field_seasons','probe_assignments','contacts'])));
export const PATCH = withApiAuth(async request => {
 const {fieldId,select_options}=await request.json();
 return NextResponse.json(await saveSelectOptions(fieldId,select_options));
});
