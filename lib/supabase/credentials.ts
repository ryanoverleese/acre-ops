import 'server-only';
import { query } from './database';
import { getRow } from './adapter';

export async function findUser(email: string) {
  const rows = await query('SELECT id FROM public.users WHERE lower(email) = lower($1)',[email.trim()]);
  // Never guess if a legacy source has case-insensitive duplicate accounts.
  if (rows.length !== 1) return null;
  return getRow<{id:number;email:string;name:string;active:boolean;password_hash:string;role:{value:string}}>('users',Number(rows[0].id),true);
}
export async function findInstaller(name: string) {
  const rows = await query('SELECT id FROM public.installers WHERE name = $1',[name]);
  if (rows.length !== 1) return null;
  return getRow<{id:number;name:string;pin:string|null}>('installers',Number(rows[0].id),true);
}
