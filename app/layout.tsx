import type { Metadata } from 'next';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import Providers from '@/components/Providers';

const AskAI = dynamic(() => import('@/components/AskAI'), { loading: () => null });

export const metadata: Metadata = {
  title: 'Acre Insights Operation Center',
  description: 'Agricultural probe management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="dns-prefetch" href="https://api.baserow.io" />
        <link rel="preconnect" href="https://api.baserow.io" />
      </head>
      <body>
        <Providers>
          <Suspense fallback={null}>
            <LoadingBar />
          </Suspense>
          <div className="app">
            <AppShell>{children}</AppShell>
          </div>
          <AskAI />
        </Providers>
      </body>
    </html>
  );
}
