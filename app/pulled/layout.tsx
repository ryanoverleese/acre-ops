import type { Metadata, Viewport } from 'next';
import { staffMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = staffMetadata('pulled');

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function PulledLayout({ children }: { children: React.ReactNode }) {
  return children;
}
