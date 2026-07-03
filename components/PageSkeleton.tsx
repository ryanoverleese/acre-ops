/**
 * Shared route-loading skeleton. Shows the real page title immediately with a
 * shimmering table placeholder (uses the existing .skeleton class from
 * globals.css) so navigation reads as "loading" instead of a frozen blank page.
 */
export default function PageSkeleton({ title, rows = 12 }: { title: string; rows?: number }) {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>{title}</h2>
        </div>
      </header>
      <div className="content">
        {/* Toolbar placeholder */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="skeleton" style={{ height: 32, width: 180 }} />
          <div className="skeleton" style={{ height: 32, width: 120 }} />
          <div className="skeleton" style={{ height: 32, width: 120 }} />
        </div>
        {/* Table row placeholders */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 36, width: '100%', marginBottom: 8, opacity: 1 - i * 0.06 }}
          />
        ))}
      </div>
    </>
  );
}
