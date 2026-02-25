'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="error-icon">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="48" height="48">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="error-title">Something went wrong</h2>
      <p className="error-message">{error.message}</p>
      {error.digest && <p className="error-digest">Error ID: {error.digest}</p>}
      <button onClick={() => reset()} className="btn btn-primary">
        Try again
      </button>
    </div>
  );
}
