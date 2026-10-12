import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { query } from '@/lib/supabase/database';
export const dynamic='force-dynamic';
export const GET=withApiAuth(async()=>{
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const season=Number(date.slice(0,4));
 const rows=await query("SELECT (SELECT count(*) FROM public.probe_assignments WHERE removal_date=$1::date) AS count, (SELECT count(*) FROM public.probe_assignments pa JOIN public.field_seasons fs ON fs.id=pa.field_season_id JOIN public.assignment_probe_status_options status ON status.id=pa.probe_status_id WHERE fs.season=$2 AND lower(status.value)='installed') AS remaining",[date,season]);
 const count=Number(rows[0].count), remainingInstalled=Number(rows[0].remaining);
 return NextResponse.json({count,remainingInstalled,leftToGo:remainingInstalled,date,season,timezone:'America/Chicago',label:'TOTAL PROBES PULLED TODAY',leftLabel:'LEFT TO GO'});
});
