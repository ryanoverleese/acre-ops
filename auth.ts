import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import config from './auth.config';
import { findUser } from './lib/supabase/credentials';
import { updateRow } from './lib/baserow';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...config,
  providers: [Credentials({
    name: 'credentials',
    credentials: {email:{label:'Email',type:'email'},password:{label:'Password',type:'password'}},
    async authorize(credentials) {
      if(typeof credentials?.email!=='string'||typeof credentials?.password!=='string') return null;
      const user = await findUser(credentials.email);
      if(!user || !user.active || !await compare(credentials.password,user.password_hash)) return null;
      await updateRow('users',user.id,{last_login:new Date().toISOString()});
      return {id:String(user.id),email:user.email,name:user.name,role:user.role.value};
    },
  })],
});
