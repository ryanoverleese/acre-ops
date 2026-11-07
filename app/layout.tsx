import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import Providers from '@/components/Providers';
import { OG_IMAGE, PRIVATE_ROBOTS, SITE_NAME, SITE_URL } from '@/lib/site-metadata';

// Privileged server data must be loaded at request time, never baked into public
// build output. Explicit adapter caches still expire immediately after writes.
export const dynamic = 'force-dynamic';

const ROOT_DESCRIPTION = 'Staff tools for Acre Insights field operations. Records stay behind sign-in.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: '%s · Acre Ops',
  },
  description: ROOT_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: PRIVATE_ROBOTS,
  manifest: '/manifest.json',
  openGraph: {
    title: SITE_NAME,
    description: ROOT_DESCRIPTION,
    siteName: SITE_NAME,
    type: 'website',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: ROOT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('acre-ops-theme');if(t)document.documentElement.dataset.theme=t;})();` }} />
      </head>
      <body>
        <Providers>
          <Suspense fallback={null}>
            <LoadingBar />
          </Suspense>
          <div className="app">
            <AppShell>{children}</AppShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
