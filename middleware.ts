import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// Routes that installers can access
const INSTALLER_ROUTES = [
  '/',
  '/install',
  '/route',
  '/approvals',
  '/repairs',
];

// Routes that don't require authentication at all
const PUBLIC_ROUTES = ['/login', '/approve', '/field-info', '/api/field-info'];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow auth API routes
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Allow register API (for initial setup)
  if (pathname.startsWith('/api/register')) {
    return NextResponse.next();
  }

  // Allow debug API (diagnostic endpoints)
  if (pathname.startsWith('/api/debug')) {
    return NextResponse.next();
  }

  // If not authenticated, redirect to login
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based access control
  const role = req.auth.user?.role;

  if (role === 'installer') {
    // For page routes, check if installer is allowed
    const isApiRoute = pathname.startsWith('/api/');
    if (!isApiRoute) {
      const isAllowed = INSTALLER_ROUTES.some((route) =>
        route === '/' ? pathname === '/' : pathname.startsWith(route)
      );
      if (!isAllowed) {
        return NextResponse.redirect(new URL('/install', req.url));
      }
    }

    // For API routes, installers can access install-related and read-only endpoints
    if (isApiRoute) {
      const installerApiRoutes = [
        '/api/install',
        '/api/field-seasons',
        '/api/probe-assignments',
        '/api/fields',
        '/api/probes',
        '/api/elevation',
        '/api/geocode',
        '/api/repairs',
      ];
      const isAllowedApi = installerApiRoutes.some((route) => pathname.startsWith(route));
      if (!isAllowedApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and images
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
