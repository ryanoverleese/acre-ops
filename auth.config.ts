import type { NextAuthConfig } from 'next-auth';
export default {
  providers: [],
  pages: {signIn:'/login'},
  // New cookie namespace prevents Baserow IDs in old sessions from being reused.
  cookies: {sessionToken:{name:'acre-auth-supabase-v1',options:{httpOnly:true,sameSite:'lax',path:'/',secure:process.env.NODE_ENV==='production'}}},
  callbacks: {
    async jwt({token,user}) { if(user) {token.role=(user as {role?:string}).role;token.id=user.id;token.backend='supabase-native-v1';} return token; },
    async session({session,token}) { if(session.user) {session.user.role=token.role as string;session.user.id=token.backend==='supabase-native-v1'?token.id as string:'';} return session; },
  },
  session: {strategy:'jwt'},
} satisfies NextAuthConfig;
