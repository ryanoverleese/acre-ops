export default function Loading() {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Map</h2>
        </div>
      </header>
      <div className="content" style={{ padding: 0 }}>
        <div className="skeleton" style={{ height: '100%', minHeight: '70vh', width: '100%', borderRadius: 0 }} />
      </div>
    </>
  );
}
