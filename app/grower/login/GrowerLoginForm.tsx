'use client';

import { useState } from 'react';

export default function GrowerLoginForm({ callbackUrl = '/grower' }: { callbackUrl?: string }) {
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
        setError(typeof data.error === 'string' ? data.error : 'Incorrect farm name or PIN');
        return;
      }
      window.location.href = callbackUrl.startsWith('/grower') ? callbackUrl : '/grower';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Acre Insights</h1>
          <p>Grower fields</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <div className="login-field">
            <label className="login-label" htmlFor="grower-farm-name">Farm name</label>
            <input
              id="grower-farm-name"
              type="text"
              className="login-input"
              value={farm}
              onChange={(e) => setFarm(e.target.value)}
              required
              autoFocus
              autoComplete="organization"
              placeholder="Your farm name"
            />
          </div>
          <div className="login-field">
            <label className="login-label" htmlFor="grower-pin">PIN</label>
            <input
              id="grower-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              className="login-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="4–6 digit PIN"
            />
          </div>
          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
