'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GROWER_TABS, growerTabForPath } from '@/lib/grower-nav';
import GrowerActivityBeacon from '@/components/grower/GrowerActivityBeacon';

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

function GrowerFooter() {
  return (
    <footer className="grower-footer">
      <Image
        src="/acre-insights-logo-footer.png"
        alt="Acre Insights"
        width={158}
        height={24}
        style={{ objectFit: 'contain' }}
      />
    </footer>
  );
}

export default function GrowerChrome({
  children,
  operationName,
}: {
  children: ReactNode;
  operationName?: string | null;
}) {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/grower/login')) {
    return (
      <div className="grower-chrome grower-chrome-login">
        {children}
        <GrowerFooter />
      </div>
    );
  }
  const active = growerTabForPath(pathname);
  const name = operationName?.trim() || null;

  return (
    <div className="grower-chrome">
      <GrowerActivityBeacon />
      {name && (
        <header className="grower-topbar">
          <span className="grower-op-name">{name}</span>
        </header>
      )}
      <nav className="grower-tabs" aria-label="Main">
        {name && <span className="grower-op-name">{name}</span>}
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
      <GrowerFooter />
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
