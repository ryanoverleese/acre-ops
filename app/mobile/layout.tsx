import type { Metadata, Viewport } from 'next';
import './mobile.css';

export const metadata: Metadata = {
  title: 'Acre Ops',
  description: 'Acre Insights mobile operations app',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Acre Ops',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
