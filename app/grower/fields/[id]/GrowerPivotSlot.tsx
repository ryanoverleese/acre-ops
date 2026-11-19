import GrowerPivotIcon from '@/components/grower/GrowerPivotIcon';
import type { IconPoint } from '@/lib/valley/grower-icon';
import { growerFieldPivots } from '@/lib/valley/grower';

// Async server components streamed inside <Suspense>. The page has already
// checked the field belongs to the session's farm; growerFieldPivots checks
// again before any Valley read. Nothing renders unless a live reading exists.

export async function GrowerPivotNote({ operationId, fieldId }: { operationId: number; fieldId: number }) {
  const pivots = await growerFieldPivots(operationId, fieldId);
  if (!pivots.length) return null;
  return <p className="grower-pivot-note">Pivot position at time of recommendation</p>;
}

export async function GrowerPivotIcons({ operationId, fieldId, probe }: {
  operationId: number;
  fieldId: number;
  probe: IconPoint | null;
}) {
  const pivots = await growerFieldPivots(operationId, fieldId);
  if (!pivots.length) return null;
  // The probe dot is only meaningful against a single pivot circle.
  const dot = pivots.length === 1 ? probe : null;
  return (
    <span className="grower-pivot-icons">
      {pivots.map((pivot, i) => <GrowerPivotIcon key={i} pivot={pivot} probe={dot} />)}
    </span>
  );
}
