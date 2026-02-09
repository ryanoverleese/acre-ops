'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: '#0a0a1a', color: '#e0e0e0', fontFamily: 'monospace' }}>
        <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>Global Error</h2>
          <div style={{
            background: '#1a1a2e',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            overflow: 'auto',
          }}>
            <p style={{ color: '#ef4444', fontWeight: 'bold' }}>{error.message}</p>
            {error.digest && <p style={{ color: '#888', fontSize: '12px' }}>Digest: {error.digest}</p>}
            {error.stack && (
              <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', marginTop: '12px', color: '#aaa' }}>
                {error.stack}
              </pre>
            )}
          </div>
          <button
            onClick={() => reset()}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
