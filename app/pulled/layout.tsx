import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Probes Pulled Today',
  description: 'Live count of probes pulled today (America/Chicago)',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function PulledLayout({ children }: { children: React.ReactNode }) {
  return children;
}
