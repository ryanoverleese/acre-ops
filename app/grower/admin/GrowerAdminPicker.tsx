'use client';

import { useMemo, useState } from 'react';

type Operation = { id: number; name: string; pinSet: boolean };

export default function GrowerAdminPicker({
  operations,
  loadError,
}: {
  operations: Operation[];
  loadError: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? operations.filter((op) => op.name.toLowerCase().includes(q)) : operations;
  }, [filter, operations]);

  const view = async (op: Operation) => {
    setError('');
    setBusy(op.id);
    try {
      const res = await fetch('/api/grower-auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: op.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'Could not open that operation.');
        return;
      }
      window.location.href = '/grower/fields';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await fetch('/api/grower-auth', { method: 'DELETE' });
    window.location.href = '/grower/login';
  };

  return (
    <div className="grower-shell grower-admin">
      <header className="grower-top grower-top-home">
        <div>
          <h1 className="grower-title">View as grower</h1>
          <p className="grower-sub">
            Pick an operation to see their grower app. Nothing you open here shows up in their activity.
          </p>
        </div>
        <button type="button" className="grower-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      {loadError && (
        <p className="grower-banner-error">Could not load operations. Try again.</p>
      )}
      {error && <p className="grower-banner-error">{error}</p>}

      <label className="grower-admin-filter">
        <span>Find an operation</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Type a farm name"
          autoComplete="off"
        />
      </label>

      {shown.length === 0 ? (
        <p className="grower-empty">{operations.length ? 'No match.' : 'No current customers.'}</p>
      ) : (
        <ul className="grower-admin-list">
          {shown.map((op) => (
            <li key={op.id}>
              <button
                type="button"
                className="grower-admin-row"
                onClick={() => view(op)}
                disabled={busy !== null}
              >
                <span className="grower-admin-name">{op.name}</span>
                <span className="grower-admin-meta">
                  {busy === op.id ? 'Opening…' : op.pinSet ? 'Has grower PIN' : 'No grower PIN yet'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
