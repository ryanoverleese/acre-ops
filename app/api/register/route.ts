import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { TABLE_IDS } from '@/lib/baserow';
import { auth } from '@/auth';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

async function getUserCount(): Promise<number> {
  const url = `${BASEROW_API_URL}/${TABLE_IDS.users}/?user_field_names=true&size=1`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${BASEROW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) return -1;
  const data = await response.json();
  return data.count;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, role } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const userCount = await getUserCount();

    // If users already exist, require admin auth to create new users
    if (userCount > 0) {
      const session = await auth();
      if (!session?.user || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 });
      }
    }

    // Validate role
    const validRoles = ['admin', 'installer'];
    const userRole = role || (userCount === 0 ? 'admin' : 'installer');
    if (!validRoles.includes(userRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Hash password
    const password_hash = await hash(password, 12);

    // Create user in Baserow
    const response = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.users}/?user_field_names=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        password_hash,
        name,
        role: userRole,
        active: true,
        created_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: 'Failed to create user', details: error }, { status: 500 });
    }

    const newUser = await response.json();
    return NextResponse.json({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: userRole,
    });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
