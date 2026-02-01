import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';

export const metadata: Metadata = {
  title: 'Acre Insights - Probe Manager',
  description: 'Agricultural probe management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <LoadingBar />
        </Suspense>
        <div className="app">
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
