import type { ProbeAssignment } from './baserow';

export class RemovalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RemovalInput {
  source: 'crew' | 'workflows';
  assignmentId: number;
  removedBy: string;
  removalDate?: string;
  notes?: string;
  photos?: File[];
}

/** Storage adapters are supplied by the route; tests use an in-memory store. */
interface RemovalStore {
  getAssignment: (id: number) => Promise<ProbeAssignment>;
  listAssignments: () => Promise<ProbeAssignment[]>;
  saveAssignment: (id: number, patch: Record<string, unknown>) => Promise<ProbeAssignment>;
  saveProbe: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  uploadPhoto: (photo: File) => Promise<{ name: string; bucket?: string; path?: string; size?: number; mime?: string } | null>;
  notify: (assignment: ProbeAssignment) => void;
}

function selectValue(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

/** One removal action for the crew screen and Workflows. Never write field seasons. */
export async function recordProbeRemoval(input: RemovalInput, store: RemovalStore) {
  if (input.source !== 'crew' && input.source !== 'workflows') {
    throw new RemovalError('Invalid removal source', 400);
  }
  if (!Number.isSafeInteger(input.assignmentId) || input.assignmentId <= 0) {
    throw new RemovalError('Invalid probe assignment ID', 400);
  }
  const removedBy = input.removedBy.trim();
  if (!removedBy) throw new RemovalError('Who pulled it is required', 400);
  // Crew submissions default to today; Workflows retains its date picker.
  const removalDate = input.removalDate ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(removalDate)
    || !Number.isFinite(Date.parse(removalDate))
    || new Date(removalDate).toISOString().slice(0, 10) !== removalDate) {
    throw new RemovalError('A valid removal date is required', 400);
  }

  const existing = await store.getAssignment(input.assignmentId);
  // Resolve the physical device from the server record, never from a client probe ID.
  const probeId = existing.probe?.[0]?.id;
  if (existing.probe?.length !== 1 || !Number.isSafeInteger(probeId) || !probeId || probeId <= 0) {
    throw new RemovalError('This assignment must link to exactly one probe before recording removal', 409);
  }
  const alreadyRemoved = selectValue(existing.probe_status) === 'Removed' && !!existing.removal_date;

  // An old/retried request must not return a reinstalled device to stock. This
  // is a read-only check of the SAME probe; no sibling assignments are updated.
  const assignments = await store.listAssignments();
  if (assignments.some(assignment => assignment.id !== existing.id
    && assignment.probe?.some(probe => probe.id === probeId)
    && !assignment.removal_date && selectValue(assignment.probe_status) !== 'Removed'
    && (assignment.install_date || selectValue(assignment.probe_status) === 'Installed'))) {
    throw new RemovalError('This probe has another active installation. Review its assignments before returning it to stock.', 409);
  }

  let saved = existing;
  const uploaded: { name: string }[] = [];
  const photoErrors: string[] = [];
  if (!alreadyRemoved) {
    for (const photo of input.photos || []) {
      try {
        const file = await store.uploadPhoto(photo);
        if (file) uploaded.push(file);
      } catch {
        photoErrors.push('A removal photo could not be uploaded');
      }
    }
    const patch: Record<string, unknown> = {
      probe_status: 'Removed',
      removal_date: removalDate,
      removed_by: removedBy,
    };
    if (input.notes?.trim()) patch.removal_notes = input.notes.trim();
    if (uploaded.length) patch.removal_photo = uploaded;
    try {
      saved = await store.saveAssignment(existing.id, patch);
    } catch {
      throw new RemovalError('Could not save the removal. Try again.', 502);
    }
    // The Supabase route queues this callback AFTER the transaction commits.
    // Only crew removals notify CropX; Workflows records the database removal only.
    if (input.source === 'crew') store.notify(saved);
  }

  // The Supabase route wraps both writes in one transaction. The pure service
  // also remains usable with a retryable store in the isolated safety tests.
  try {
    await store.saveProbe(probeId, { status: 'In Stock' });
  } catch {
    throw new RemovalError('Removal recorded, but the probe could not be set to In Stock. Retry to finish; the saved removal date and remover will be kept.', 502);
  }
  return {
    ok: true,
    alreadyRemoved,
    removal_date: saved.removal_date,
    removed_by: saved.removed_by,
    photos: uploaded.length,
    photoErrors: photoErrors.length ? photoErrors : undefined,
  };
}
