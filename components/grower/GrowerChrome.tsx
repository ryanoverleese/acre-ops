'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GROWER_TABS, growerTabForPath } from '@/lib/grower-nav';

function FieldsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 14s5-4.2 5-7.2A5 5 0 1 0 3 6.8C3 9.8 8 14 8 14z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8" cy="6.8" r="1.6" fill="currentColor" />
    </svg>
  );
}

function RecsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = { fields: FieldsIcon, probes: PinIcon, recs: RecsIcon };

export default function GrowerChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/grower/login')) return <>{children}</>;
  const active = growerTabForPath(pathname);

  return (
    <div className="grower-chrome">
      <nav className="grower-tabs" aria-label="Main">
        {GROWER_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={active === tab.id ? 'is-active' : undefined}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
      <div className="grower-pill-wrap">
        <nav className="grower-pill" aria-label="Main">
          {GROWER_TABS.map((tab) => {
            const Icon = ICONS[tab.id];
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={active === tab.id ? 'is-active' : undefined}
                aria-current={active === tab.id ? 'page' : undefined}
              >
                <Icon />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
