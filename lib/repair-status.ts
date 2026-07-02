// One source of truth for repair status colors. Both renderers — the desktop
// /repairs page and the installer app — import from here so a repair state
// always looks the same everywhere (see CLAUDE.md "Installer/desktop parity").
export const REPAIR_COLORS = {
  open: '#ef4444',        // red — needs attention
  watch: '#0EA5E9',       // light blue — on the watch list, not urgent
  watchBg: '#E0F2FE',     // card/badge background tint
  watchBgSoft: '#F0F9FF', // list-row background tint
  watchBorder: '#7DD3FC',
  watchText: '#0369A1',
  resolved: '#22c55e',    // green — closed out
} as const;

/** Dot/pin color for a repair given its status + watch flag. */
export function repairColor(open: boolean, watchList?: boolean): string {
  if (!open) return REPAIR_COLORS.resolved;
  return watchList ? REPAIR_COLORS.watch : REPAIR_COLORS.open;
}
