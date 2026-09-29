'use client';

export default function EquipmentError({ reset }: { reset: () => void }) {
  return (
    <div className="content" role="alert">
      <h2>Couldn’t load this equipment view</h2>
      <p>There was a problem loading this view. Try again in a moment.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
