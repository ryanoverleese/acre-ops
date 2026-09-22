import type { Metadata, Viewport } from 'next';
import InstallerSwRegister from './InstallerSwRegister';

export const metadata: Metadata = {
  title: 'Probe Installer',
  manifest: '/installer-manifest.json',
  appleWebApp: {
    title: 'Probe Installer',
    statusBarStyle: 'default',
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
  return (
    <>
      <InstallerSwRegister />
      {children}
    </>
  );
}
