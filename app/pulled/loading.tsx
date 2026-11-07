export default function Loading() {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Loading pull tally…
    </main>
  );
}
