'use client';

const NAV = [
  { href: '/grower/fields', label: 'Fields' },
  { href: '/grower/hardware', label: 'Hardware' },
  { href: '/grower/recommendations', label: 'Recommendations' },
] as const;

export default function GrowerHome({
  farmName,
  season,
}: {
  farmName: string;
  season: number;
}) {
  const signOut = async () => {
    await fetch('/api/grower-auth', { method: 'DELETE' });
    window.location.href = '/grower/login';
  };

  return (
    <div className="grower-shell">
      <header className="grower-top">
        <div>
          <p className="grower-kicker">Acre Insights</p>
          <h1 className="grower-title">{farmName}</h1>
          <p className="grower-sub">{season} season</p>
        </div>
        <button type="button" className="grower-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      <nav className="grower-home-nav" aria-label="Grower main">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className="grower-home-nav-btn">
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
