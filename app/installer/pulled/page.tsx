'use client';

import { useCallback, useEffect, useState } from 'react';

const REFRESH_MS = 45_000;

interface PulledToday {
  count: number;
  date: string;
  timezone: string;
  label: string;
}

function formatDisplayDate(isoDate: string): string {
  // isoDate is YYYY-MM-DD in Chicago; render as a friendly local label.
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 17)); // noon-ish CT -> stable weekday
  return dt.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PulledTodayPage() {
  const [data, setData] = useState<PulledToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pulled-today', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PulledToday;
      setData(json);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError((e as Error).message || 'Could not load');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const count = data?.count;
  const dateLabel = data?.date ? formatDisplayDate(data.date) : null;

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'clamp(0.85rem, 2.8vw, 1.15rem)',
          letterSpacing: '0.14em',
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
        }}
      >
        Total probes pulled today
      </p>

      <p
        style={{
          margin: '0.75rem 0 0',
          fontSize: 'clamp(4.5rem, 28vw, 10rem)',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          letterSpacing: '-0.03em',
        }}
        aria-live="polite"
      >
        {count == null && !error ? '...' : error ? '-' : count}
      </p>

      {dateLabel && (
        <p
          style={{
            margin: '1rem 0 0',
            fontSize: 'clamp(0.95rem, 3vw, 1.25rem)',
            color: '#cbd5e1',
          }}
        >
          {dateLabel}
        </p>
      )}

      {error && (
        <p style={{ marginTop: '1rem', color: '#f87171', fontSize: '0.95rem' }}>
          {error}
        </p>
      )}

      {updatedAt && !error && (
        <p
          style={{
            marginTop: '1.75rem',
            fontSize: '0.8rem',
            color: '#64748b',
          }}
        >
          Updates every 45s - last{' '}
          {updatedAt.toLocaleTimeString('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          })}{' '}
          CT
        </p>
      )}
    </main>
  );
}
