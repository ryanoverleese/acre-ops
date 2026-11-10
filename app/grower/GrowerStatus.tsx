'use client';

import { formatGrowerProbeStatus } from '@/lib/grower-display';

function statusClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === 'installed') return 'grower-status grower-status-installed';
  if (key === 'removed') return 'grower-status grower-status-removed';
  if (key === 'assigned') return 'grower-status grower-status-assigned';
  return 'grower-status grower-status-muted';
}

/** Visible Installed / Removed (etc.) chip for probes and field summaries. */
export function GrowerStatusBadge({ status }: { status: string | null | undefined }) {
  const label = formatGrowerProbeStatus(status);
  return <span className={statusClass(label)}>{label}</span>;
}

export function GrowerFieldStatusBadges({ label }: { label: string }) {
  if (label === 'No probes' || label === 'Status not recorded') {
    return <span className="grower-status grower-status-muted">{label}</span>;
  }
  return (
    <span className="grower-status-group">
      {label.split(' · ').map((part) => (
        <span key={part} className={statusClass(part)}>
          {part}
        </span>
      ))}
    </span>
  );
}
