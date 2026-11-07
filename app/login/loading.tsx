export default function Loading() {
  return (
    <div className="login-page" role="status" aria-live="polite">
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'Source Sans 3, sans-serif' }}>Loading sign-in…</p>
    </div>
  );
}
