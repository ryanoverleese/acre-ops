import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import Providers from '@/components/Providers';

// Privileged server data must be loaded at request time, never baked into public
// build output. Explicit adapter caches still expire immediately after writes.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acre Insights Operation Center',
  description: 'Agricultural probe management system',
  manifest: '/manifest.json',
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
