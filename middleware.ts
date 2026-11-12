import NextAuth from 'next-auth';
import authConfig from './auth.config';
const { auth } = NextAuth(authConfig);
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { LEGACY_EQUIPMENT_ROUTES } from '@/lib/equipment-navigation';
import { CREW_COOKIE, readCrewSession } from '@/lib/crew-session';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import { isKnownAppRoute } from '@/lib/known-routes';

// Routes that installers can access
const INSTALLER_ROUTES = [
  '/',
  '/install',
  '/route',
  '/approvals',
  '/repairs',
];

// Routes that don't require authentication at all
const PUBLIC_ROUTES = ['/login', '/approve', '/review', '/field-info', '/api/field-info', '/api/probe-assignments', '/installer', '/api/installer', '/api/installer-auth', '/api/installer-pins', '/api/install', '/api/removal', '/api/mileage', '/api/probes', '/api/fields', '/api/field-boundaries', '/api/elevation', '/api/usgs-elevation', '/api/usgs-lidar', '/api/geocode', '/api/repairs', '/pulled', '/api/pulled-today', '/api/grower-auth'];
// Note: /api/field-boundaries is middleware-public like /api/fields; withApiAuth still
// requires crew/staff. Without this, PIN login was redirected to /login before the API ran.

const authenticatedMiddleware = auth(async (req, _event: NextFetchEvent) => {
  const { pathname } = req.nextUrl;
  const grower = await readGrowerSession(req.cookies.get(GROWER_COOKIE)?.value);

  // The retired general mobile app was replaced by the installer app. Keep
  // old bookmarks and installed home-screen shortcuts working.
  if (pathname === '/mobile' || pathname.startsWith('/mobile/')) {
    return NextResponse.redirect(new URL('/installer', req.url));
  }

  // Shareable tally: reuse installer chrome-less shell (AppShell treats /installer as public).
  if (pathname === '/pulled' || pathname.startsWith('/pulled/')) {
    return NextResponse.redirect(new URL('/installer/pulled', req.url));
  }

  // Grower area: farm-name + PIN session. Office staff auth is separate.
  if (pathname === '/grower' || pathname.startsWith('/grower/')) {
    if (pathname.startsWith('/grower/login')) return NextResponse.next();
    if (!grower) {
      const loginUrl = new URL('/grower/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
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

  // Crew sessions may read their private assignment photos and picker data.
  // Each route independently checks the signed session and its table/action scope.
  const crewRead = req.method === 'GET' && (
    /^\/api\/files\/probe_assignments\/\d+\/(install_photo_field_end|install_photo_extra|removal_photo)\/\d+$/.test(pathname) ||
    pathname === '/api/select-options' || pathname === '/api/probe-rack'
  );
  if (crewRead && await readCrewSession(req.cookies.get(CREW_COOKIE)?.value)) return NextResponse.next();

  // If not authenticated, redirect to login
  if (!req.auth?.user?.id) {
    // A grower cookie must not open office pages.
    if (grower) {
      return NextResponse.redirect(new URL('/grower', req.url));
    }
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
        '/api/removal',
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

  // Keep old bookmarks and links working, without changing access rules.
  const equipmentPath = LEGACY_EQUIPMENT_ROUTES[pathname];
  if (equipmentPath) {
    const destination = req.nextUrl.clone();
    destination.pathname = equipmentPath;
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
});

function applyRobots(response: Response) {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // Unknown URLs have no page. Sending them through the login redirect made
  // a missing address return 200. They skip auth and render not-found.
  // Every known page and API still uses the auth middleware below, unchanged.
  if (!isKnownAppRoute(pathname)) {
    return applyRobots(NextResponse.next());
  }

  const response = await authenticatedMiddleware(request, event);
  if (!response) return response;

  // Authorization must be read-only. A delayed page/prefetch response can
  // otherwise restore its refreshed cookie after a successful sign-out.
  // Auth.js endpoints own session creation, refresh, and expiration.
  const sessionName = authConfig.cookies.sessionToken.name;
  const cookies = response.headers.getSetCookie();
  response.headers.delete('set-cookie');
  for (const cookie of cookies) {
    const name = cookie.slice(0, cookie.indexOf('='));
    if (name !== sessionName && !name.startsWith(`${sessionName}.`)) {
      response.headers.append('set-cookie', cookie);
    }
  }
  return applyRobots(response);
}

export const config = {
  matcher: [
    // Auth.js owns its endpoints, including CSRF and cookie expiration. Running
    // auth() here renews the session after sign-out has already cleared it.
    // Exclude only /api/auth and its children, not similarly named app routes.
    // robots.txt and sitemap.xml stay public and list no private routes.
    '/((?!api/auth(?:/|$)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest\\.json|installer-manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
