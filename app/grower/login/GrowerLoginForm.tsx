'use client';

import { useState } from 'react';

export default function GrowerLoginForm({ callbackUrl = '/grower/fields' }: { callbackUrl?: string }) {
  const [farm, setFarm] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/grower-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farm, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Incorrect farm name, username, or PIN');
        return;
      }
      const next = callbackUrl === '/grower' || !callbackUrl.startsWith('/grower')
        ? '/grower/fields'
        : callbackUrl;
      window.location.href = next;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grower-shell grower-login">
      <header className="grower-top grower-top-home">
        <h1 className="grower-title">Grower sign in</h1>
      </header>
      <form onSubmit={handleSubmit} className="grower-login-form">
        {error && <p className="grower-login-error" role="alert">{error}</p>}
        <div className="grower-login-field">
          <label className="grower-login-label" htmlFor="grower-farm-name">Farm or username</label>
          <input
            id="grower-farm-name"
            type="text"
            className="grower-login-input"
            value={farm}
            onChange={(e) => setFarm(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            placeholder="Farm name or username"
          />
        </div>
        <div className="grower-login-field">
          <label className="grower-login-label" htmlFor="grower-pin">PIN</label>
          <input
            id="grower-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            className="grower-login-input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" disabled={loading} className="grower-login-submit">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
