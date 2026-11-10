'use client';

export default function GrowerHome({ farmName }: { farmName: string }) {
  const signOut = async () => {
    await fetch('/api/grower-auth', { method: 'DELETE' });
    window.location.href = '/grower/login';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>{farmName}</h1>
          <p>Grower fields — more coming next</p>
        </div>
        <div className="login-form">
          <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-secondary)' }}>
            You are signed in. Field list and map land in the next steps.
          </p>
          <button type="button" className="login-submit" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
