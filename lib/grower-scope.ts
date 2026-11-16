/** Browser-safe helpers for which farm(s) a grower page shows. No database. */

export const ALL_OPERATIONS_NAME = 'All operations';

type ScopeSession = { operationId: number; admin?: true; all?: true } | null | undefined;

/** True only for an Acre Insights staff session viewing every operation. */
export function isAllOperationsSession(session: ScopeSession): boolean {
  return session?.admin === true && session.all === true;
}

/**
 * Operation a field page reads. A grower (or single-farm staff) session is
 * always its own farm and ?op is ignored. Only the staff "All operations"
 * view takes the farm from ?op, which the page then checks is a current
 * customer before reading.
 */
export function fieldOperationFor(session: ScopeSession, opParam: unknown): number | null {
  if (!session) return null;
  if (!isAllOperationsSession(session)) return session.operationId > 0 ? session.operationId : null;
  const raw = Array.isArray(opParam) ? opParam[0] : opParam;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Link to a field page; carries ?op only in the All operations view. */
export function growerFieldHref(fieldId: number, operationId?: number | null): string {
  return operationId ? `/grower/fields/${fieldId}?op=${operationId}` : `/grower/fields/${fieldId}`;
}
