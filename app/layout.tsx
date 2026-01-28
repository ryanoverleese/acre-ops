import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

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
        <div className="app">
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
