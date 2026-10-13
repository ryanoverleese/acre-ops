import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { withApiAuth } from '@/lib/supabase/api';
import { DataError } from '@/lib/supabase/registry';
import { findInstaller } from '@/lib/supabase/credentials';
import { createCrewSession, CREW_COOKIE } from '@/lib/crew-session';
const attempts=new Map<string,{count:number;until:number}>();
export const POST=withApiAuth(async request=>{
 const {installer,pin}=await request.json();
 if(typeof installer!=='string'||!/^\d{4,6}$/.test(String(pin))) throw new DataError('Installer and PIN required');
 const key=installer.toLowerCase();const now=Date.now(); const prior=attempts.get(key);
 if(prior&&prior.until>now&&prior.count>=10) throw new DataError('Too many attempts; try again later',429);
 attempts.set(key,{count:prior&&prior.until>now?prior.count+1:1,until:prior&&prior.until>now?prior.until:now+15*60*1000});
 if(attempts.size>1000) for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
 const row=await findInstaller(installer);
 const valid=!!row?.pin && /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(row.pin) && await compare(String(pin),row.pin);
 if(!row||!valid) throw new DataError('Incorrect installer or PIN',401);
 attempts.delete(key);
 const response=NextResponse.json({ok:true,id:row.id});
 response.cookies.set(CREW_COOKIE,await createCrewSession(row.id,row.name),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:12*60*60});
 return response;
});
export const DELETE=withApiAuth(async()=>{
 const response=NextResponse.json({ok:true}); response.cookies.delete(CREW_COOKIE); return response;
});
