import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

async function getUserByEmail(email: string) {
  const url = `${BASEROW_API_URL}/${TABLE_IDS.users}/?user_field_names=true&search=${encodeURIComponent(email)}&size=1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const data = await response.json();
  const user = data.results?.find(
    (u: { email: string }) => u.email.toLowerCase() === email.toLowerCase()
  );
  return user || null;
}

async function updateLastLogin(userId: number) {
  try {
    await fetch(`${BASEROW_API_URL}/${TABLE_IDS.users}/${userId}/?user_field_names=true`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ last_login: new Date().toISOString() }),
    });
  } catch {
    // Non-critical, don't block login
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;

        // Check if user is active
        if (user.active === false) return null;

        // Verify password
        const isValid = await compare(password, user.password_hash);
        if (!isValid) return null;

        // Update last login timestamp
        await updateLastLogin(user.id);

        const role = typeof user.role === 'object' ? user.role.value : user.role;

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: role,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
});
