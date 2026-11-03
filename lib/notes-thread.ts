// Plan → Placement → Install → Removal notes thread.
// One ordered, labeled list of the seasonal notes crews read, built from
// existing columns only (no schema changes). Empty stages are skipped.

export type NoteStageLabel = 'Plan' | 'Placement' | 'Install' | 'Removal';

export interface NoteStage {
  stage: NoteStageLabel;
  text: string;
}

export interface NotesThreadSource {
  fieldNote?: unknown;      // field_seasons.field_note
  placementNotes?: unknown; // probe_assignments.placement_notes
  installNotes?: unknown;   // probe_assignments.install_notes
  removalNotes?: unknown;   // probe_assignments.removal_notes
}

function clean(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return clean((v as Record<string, unknown>).value);
  }
  return String(v).trim();
}

export function buildNotesThread(src: NotesThreadSource): NoteStage[] {
  const stages: [NoteStageLabel, unknown][] = [
    ['Plan', src.fieldNote],
    ['Placement', src.placementNotes],
    ['Install', src.installNotes],
    ['Removal', src.removalNotes],
  ];
  return stages
    .map(([stage, v]) => ({ stage, text: clean(v) }))
    .filter(s => s.text.length > 0);
}
