'use client';

/**
 * Root error UI. Keep free of shared Providers/layout so prerender of
 * /_global-error does not depend on app React context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error?.message || 'Something went wrong';
  const digest = error?.digest;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: '#f7f5f2',
          color: '#1a1815',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center', padding: '40px 20px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 15, color: '#57534e', margin: '0 0 8px' }}>{message}</p>
          {digest ? (
            <p style={{ fontSize: 12, color: '#78716c', margin: '0 0 24px' }}>
              Error ID: {digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 20px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: '#4a7a5b',
              color: '#fff',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
