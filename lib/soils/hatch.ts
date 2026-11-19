/**
 * Grayscale hatch patterns for zoomed-out staff Soils (z11 to z13).
 * Pure helpers: a stable family -> pattern id, and painting a seamless tile.
 * No solid color fill; the tile is transparent except for the thin gray marks.
 */

export const SOIL_HATCH_IDS = [
  'diag',
  'back',
  'horiz',
  'vert',
  'dots',
  'cross',
  'grid',
  'dash',
  'plus',
] as const;

export type SoilHatchId = (typeof SOIL_HATCH_IDS)[number];

/** Line color baked into the tile. Semi-transparent so Elevation stays readable. */
export const HATCH_STROKE = 'rgba(28, 28, 28, 0.56)';
export const HATCH_LINE_WIDTH = 1;

/**
 * Common south-central Nebraska families get the most distinct patterns.
 * Everything else is a stable hash onto the same set.
 */
const PREFERRED: Record<string, SoilHatchId> = {
  'Holdrege silt loam': 'diag',
  'Butler silt loam': 'back',
  'Detroit silt loam': 'horiz',
  'Coly silt loam': 'vert',
  'Kenesaw silt loam': 'dots',
  'Fillmore silt loam': 'cross',
  'Hord silt loam': 'grid',
  'Kenesaw and Coly silt loams': 'dash',
  'Coly-Uly silt loams': 'plus',
};

/** Cross and grid use a larger tile so they stay airy. */
export function hatchSize(id: SoilHatchId): number {
  return id === 'cross' || id === 'grid' ? 30 : 24;
}

export function soilFamilyHatch(family: string): SoilHatchId {
  const preferred = PREFERRED[family];
  if (preferred) return preferred;
  let h = 0;
  const key = family || 'Unnamed map unit';
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return SOIL_HATCH_IDS[Math.abs(h) % SOIL_HATCH_IDS.length];
}

type HatchContext = {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  strokeStyle: unknown;
  fillStyle: unknown;
  lineWidth: number;
  lineCap: string;
};

/** Paint one seamless hatch tile. Safe to call from tests with a stub context. */
export function paintHatch(ctx: HatchContext, id: SoilHatchId, size = hatchSize(id)) {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = HATCH_STROKE;
  ctx.fillStyle = HATCH_STROKE;
  ctx.lineWidth = HATCH_LINE_WIDTH;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  if (id === 'diag') {
    ctx.moveTo(0, size); ctx.lineTo(size, 0);
    ctx.moveTo(-1, 1); ctx.lineTo(1, -1);
    ctx.moveTo(size - 1, size + 1); ctx.lineTo(size + 1, size - 1);
    ctx.stroke();
    return;
  }
  if (id === 'back') {
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(size - 1, -1); ctx.lineTo(size + 1, 1);
    ctx.moveTo(-1, size - 1); ctx.lineTo(1, size + 1);
    ctx.stroke();
    return;
  }
  if (id === 'horiz') {
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    return;
  }
  if (id === 'vert') {
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.stroke();
    return;
  }
  if (id === 'dots') {
    ctx.arc(size / 2, size / 2, 1.35, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (id === 'cross') {
    ctx.moveTo(0, size); ctx.lineTo(size, 0);
    ctx.moveTo(-1, 1); ctx.lineTo(1, -1);
    ctx.moveTo(size - 1, size + 1); ctx.lineTo(size + 1, size - 1);
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(size - 1, -1); ctx.lineTo(size + 1, 1);
    ctx.moveTo(-1, size - 1); ctx.lineTo(1, size + 1);
    ctx.stroke();
    return;
  }
  if (id === 'grid') {
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.stroke();
    return;
  }
  if (id === 'plus') {
    const c = size / 2;
    const arm = 3.5;
    ctx.moveTo(c - arm, c); ctx.lineTo(c + arm, c);
    ctx.moveTo(c, c - arm); ctx.lineTo(c, c + arm);
    ctx.stroke();
    return;
  }
  // dash: two staggered rows of short strokes
  const y1 = size * 0.28;
  const y2 = size * 0.72;
  ctx.moveTo(0, y1); ctx.lineTo(size * 0.46, y1);
  ctx.moveTo(size * 0.54, y2); ctx.lineTo(size, y2);
  ctx.stroke();
}

export function makeHatchPattern(dest: { createPattern(src: CanvasImageSource, repeat: string): CanvasPattern | null }, id: SoilHatchId): CanvasPattern | null {
  const size = hatchSize(id);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  paintHatch(tctx, id, size);
  return dest.createPattern(tile, 'repeat');
}

const dataUrls = new Map<SoilHatchId, string>();

/** Data URL of one tile, for legend swatches. */
export function hatchDataUrl(id: SoilHatchId): string {
  const cached = dataUrls.get(id);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const size = hatchSize(id);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return '';
  paintHatch(tctx, id, size);
  const url = tile.toDataURL();
  dataUrls.set(id, url);
  return url;
}
