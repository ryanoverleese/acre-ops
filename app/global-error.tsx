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
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f7f5f2;
            color: #1a1815;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .error-page {
            max-width: 480px;
            text-align: center;
            padding: 40px 20px;
          }
          .error-icon {
            color: #dc2626;
            margin-bottom: 20px;
            opacity: 0.7;
          }
          .error-title {
            font-family: 'General Sans', sans-serif;
            font-size: 24px;
            font-weight: 600;
            color: #1a1815;
            margin-bottom: 8px;
          }
          .error-message {
            font-size: 15px;
            color: #57534e;
            margin-bottom: 8px;
          }
          .error-digest {
            font-size: 12px;
            color: #78716c;
            margin-bottom: 24px;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            padding: 10px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            background: #4a7a5b;
            color: white;
            transition: background 0.15s;
          }
          .btn:hover { background: #3d6a4e; }
        `}</style>
      </head>
      <body>
        <div className="error-page">
          <div className="error-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="error-title">Something went wrong</h2>
          <p className="error-message">{error.message}</p>
          {error.digest && <p className="error-digest">Error ID: {error.digest}</p>}
          <button onClick={() => reset()} className="btn">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
