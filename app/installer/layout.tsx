import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Acre Field',
  manifest: '/installer-manifest.json',
  appleWebApp: {
    title: 'Acre Field',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function InstallerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
