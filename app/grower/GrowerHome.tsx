'use client';

export type GrowerFieldItem = {
  id: number;
  name: string;
  acres: number | null;
  fieldSeasonId: number;
};

export default function GrowerHome({
  farmName,
  season,
  fields,
}: {
  farmName: string;
  season: number;
  fields: GrowerFieldItem[];
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
          <p className="grower-sub">{season} fields</p>
        </div>
        <button type="button" className="grower-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      {fields.length === 0 ? (
        <p className="grower-empty">No fields for {season} yet.</p>
      ) : (
        <ul className="grower-field-list">
          {fields.map((field) => (
            <li key={field.id}>
              <a href={`/grower/fields/${field.id}`} className="grower-field-row">
                <span className="grower-field-name">{field.name}</span>
                {field.acres != null && Number.isFinite(field.acres) && (
                  <span className="grower-field-meta">{field.acres} ac</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
