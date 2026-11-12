'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  growerAccessPhrase,
  growerActivityCounts,
  lastSignInPhrase,
} from '@/lib/grower-activity-display';
import type { GrowerActivityFarm } from '@/lib/grower-activity-display';

export default function GrowerActivityClient({
  farms,
  unavailable,
}: {
  farms: GrowerActivityFarm[];
  unavailable: boolean;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return farms.filter((farm) => {
      const interesting = farm.pilot || farm.pinSet || farm.loginCount > 0 || farm.viewCount > 0;
      if (!showAll && !interesting) return false;
      if (!query) return true;
      return farm.name.toLowerCase().includes(query)
        || farm.recent.some((event) => event.label.toLowerCase().includes(query));
    });
  }, [farms, search, showAll]);

  return (
    <div className="grower-activity">
      <header className="header">
        <div className="header-left">
          <h2>Grower activity</h2>
        </div>
        <div className="header-right">
          <Link className="btn btn-secondary grower-activity-jump" href="/operations">Operations</Link>
        </div>
      </header>
      <div className="content">
        <p className="grower-activity-intro">
          See whether a grower has signed in and which pages they opened. Times are Central.
        </p>
        {unavailable ? (
          <p className="grower-activity-quiet">
            Grower activity could not be loaded. Refresh the page.
          </p>
        ) : (
          <>
            <div className="grower-activity-tools">
              <label className="grower-activity-search">
                <span>Search farms</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Farm or field name"
                />
              </label>
              <label className="grower-activity-toggle">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => setShowAll(event.target.checked)}
                />
                Show operations with no PIN and no activity
              </label>
            </div>
            {visible.length === 0 ? (
              <p className="grower-activity-quiet">No matching operations.</p>
            ) : (
              <ul className="grower-activity-list">
                {visible.map((farm) => (
                  <li key={farm.id} className="grower-activity-farm">
                    <div className="grower-activity-farm-head">
                      <h3>{farm.name}</h3>
                      <span>{growerAccessPhrase(farm.pilot, farm.pinSet)}</span>
                    </div>
                    <p className="grower-activity-meta">
                      {lastSignInPhrase(farm.lastLoginLabel)}
                      {' · '}
                      {growerActivityCounts(farm.loginCount, farm.viewCount)}
                    </p>
                    {farm.recent.length > 0 && (
                      <ul className="grower-activity-recent">
                        {farm.recent.map((event, index) => (
                          <li key={`${event.createdAt}-${event.label}-${index}`}>
                            <span className="grower-activity-when">{event.when}</span>
                            <span>{event.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
