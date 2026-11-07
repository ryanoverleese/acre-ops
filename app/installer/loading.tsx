export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F6F2EA',
        color: '#1a1815',
        fontFamily: 'Source Sans 3, sans-serif',
      }}
    >
      Loading installer…
    </div>
  );
}
