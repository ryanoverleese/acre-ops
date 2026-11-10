'use client';

import { formatGrowerProbeStatus } from '@/lib/grower-display';

/** Plain status text — no chips or badges. */
export function GrowerStatusBadge({ status }: { status: string | null | undefined }) {
  const label = formatGrowerProbeStatus(status);
  return <span className="grower-status-text">{label}</span>;
}

export function GrowerFieldStatusBadges({ label }: { label: string }) {
  return <span className="grower-status-text">{label}</span>;
}
