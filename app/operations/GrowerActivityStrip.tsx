import Link from 'next/link';
import {
  growerAccessPhrase,
  growerActivityCounts,
  lastSignInPhrase,
} from '@/lib/grower-activity-display';
import type { GrowerActivityFarm } from '@/lib/grower-activity-display';

export default function GrowerActivityStrip({
  farms,
  unavailable,
}: {
  farms: GrowerActivityFarm[];
  unavailable: boolean;
}) {
  return (
    <section className="grower-activity-strip" aria-label="Grower sign-in">
      <div className="grower-activity-strip-head">
        <h3>Grower sign-in</h3>
        <Link href="/operations/grower-activity">View all activity</Link>
      </div>
      {unavailable ? (
        <p className="grower-activity-quiet">
          Grower activity could not be loaded. Refresh the page.
        </p>
      ) : farms.length === 0 ? (
        <p className="grower-activity-quiet">No grower PINs or sign-ins yet.</p>
      ) : (
        <ul className="grower-activity-strip-list">
          {farms.map((farm) => (
            <li key={farm.id}>
              <span className="grower-activity-name">{farm.name}</span>
              <span className="grower-activity-meta">
                {growerAccessPhrase(farm.pilot, farm.pinSet)}
                {' · '}
                {lastSignInPhrase(farm.lastLoginLabel)}
                {' · '}
                {growerActivityCounts(farm.loginCount, farm.viewCount)}
              </span>
              {farm.recent.length > 0 && (
                <span className="grower-activity-meta">
                  Recent: {farm.recent.slice(0, 3).map((event) => event.label).join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
