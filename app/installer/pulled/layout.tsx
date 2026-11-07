import type { Metadata, Viewport } from 'next';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = staffMetadata('installerPulled');

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
  viewportFit: 'cover',
};

export default function PulledTodayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
