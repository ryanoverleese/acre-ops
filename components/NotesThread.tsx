import type { NoteStage } from '@/lib/notes-thread';

// Plain labeled thread: Plan → Placement → Install → Removal.
// Inherits the surrounding font (sans-serif); no new fonts or colors.
export default function NotesThread({ thread, compact = false }: { thread?: NoteStage[] | null; compact?: boolean }) {
  if (!thread || thread.length === 0) return null;
  return (
    <div className="notes-thread" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      {thread.map(s => (
        <div key={s.stage}>
          <div style={{ fontSize: compact ? 9 : 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>
            {s.stage}
          </div>
          <div style={{ fontSize: compact ? 12 : 13, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
}
