'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { EQUIPMENT_TABS, getEquipmentTab } from '@/lib/equipment-navigation';
import './equipment.css';

export default function EquipmentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeTab = getEquipmentTab(pathname);

  return (
    <section className="equipment-workspace" aria-label="Equipment">
      <div className="equipment-heading">
        <h1>Equipment</h1>
        <p>Probes, storage, supplies, and weather stations.</p>
      </div>
      <nav className="equipment-tabs" aria-label="Equipment sections">
        {EQUIPMENT_TABS.map(tab => (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch={false}
            className={`equipment-tab${activeTab === tab.id ? ' active' : ''}`}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="equipment-panel">{children}</div>
    </section>
  );
}
