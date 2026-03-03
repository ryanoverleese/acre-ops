'use client';

import { SessionProvider } from 'next-auth/react';
import { OperationFocusProvider } from '@/lib/OperationFocusContext';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <OperationFocusProvider>
        {children}
      </OperationFocusProvider>
    </SessionProvider>
  );
}
