import type { ReactNode } from 'react';
import GrowerChrome from '@/components/grower/GrowerChrome';

export default function GrowerLayout({ children }: { children: ReactNode }) {
  return <GrowerChrome>{children}</GrowerChrome>;
}
