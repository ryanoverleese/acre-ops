/**
 * USDA NRCS SSURGO soil map units for the field map Soils layer.
 * Pure helpers shared by the /api/soil-map route and the map; no network here.
 */

export type SoilBbox = { w: number; s: number; e: number; n: number };
export type SoilRing = [number, number][]; // [lng, lat]
export type SoilPolygon = SoilRing[]; // outer ring, then holes
export type SoilUnit = { mukey: string; musym: string; muname: string };
export type SoilFeature = { mukey: string; polygons: SoilPolygon[] };
export type SoilMapSource = 'sda' | 'fpac';
export type SoilMap = { source: SoilMapSource; bbox: SoilBbox; units: SoilUnit[]; features: SoilFeature[] };

export const SOIL_SOURCE_LABELS: Record<SoilMapSource, string> = {
  sda: 'Soils: USDA NRCS SSURGO',
  fpac: 'Soils: USDA NRCS SSURGO (backup service, older survey)',
};

/** Largest box the route will query, in degrees (~6 km). A padded field is far smaller. */
export const SOIL_BBOX_MAX_SPAN = 0.06;
const KEY_STEP = 1e-3; // ~100 m grid so nearby requests share a cache key

/** Bounding box around a field outline, padded so the soil lines run past the field edge. */
export function soilBboxForField(rings: number[][][], pad = 0.35): SoilBbox | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) {
    for (const pt of ring) {
      const [lng, lat] = pt;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  if (!Number.isFinite(w)) return null;
  const dx = Math.max(e - w, 0.002) * pad, dy = Math.max(n - s, 0.002) * pad;
  return { w: w - dx, s: s - dy, e: e + dx, n: n + dy };
}

/** Snap outward to the key grid and print as a path segment: "w,s,e,n". */
export function soilBboxKey(box: SoilBbox): string {
  const lo = (v: number) => (Math.floor(v / KEY_STEP) * KEY_STEP).toFixed(3);
  const hi = (v: number) => (Math.ceil(v / KEY_STEP) * KEY_STEP).toFixed(3);
  return [lo(box.w), lo(box.s), hi(box.e), hi(box.n)].join(',');
}

/** Parse and validate a path key. Null when malformed, inverted, or too large. */
export function parseSoilBboxKey(key: string): SoilBbox | null {
  if (!/^-?\d{1,3}\.\d{3},-?\d{1,2}\.\d{3},-?\d{1,3}\.\d{3},-?\d{1,2}\.\d{3}$/.test(key)) return null;
  const [w, s, e, n] = key.split(',').map(Number);
  if (!(w < e && s < n)) return null;
  if (w < -180 || e > 180 || s < -90 || n > 90) return null;
  if (e - w > SOIL_BBOX_MAX_SPAN + 1e-9 || n - s > SOIL_BBOX_MAX_SPAN + 1e-9) return null;
  return { w, s, e, n };
}

export function bboxWkt(b: SoilBbox): string {
  return `POLYGON((${b.w} ${b.s},${b.e} ${b.s},${b.e} ${b.n},${b.w} ${b.n},${b.w} ${b.s}))`;
}

/** POLYGON / MULTIPOLYGON / GEOMETRYCOLLECTION WKT to polygons. Lines and points are dropped. */
export function parseWktPolygons(wkt: string): SoilPolygon[] {
  const out: SoilPolygon[] = [];
  const text = wkt.trim();
  const upper = text.toUpperCase();
  if (upper.startsWith('GEOMETRYCOLLECTION')) {
    const inner = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
    for (const part of splitTop(inner)) out.push(...parseWktPolygons(part));
    return out;
  }
  if (upper.startsWith('MULTIPOLYGON')) {
    const body = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
    for (const poly of splitTop(body)) out.push(parseRings(poly.trim().slice(1, -1)));
    return out.filter((p) => p.length && p[0].length >= 4);
  }
  if (upper.startsWith('POLYGON')) {
    const body = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
    const poly = parseRings(body);
    return poly.length && poly[0].length >= 4 ? [poly] : [];
  }
  return out;
}

function splitTop(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  const last = body.slice(start);
  if (last.trim()) parts.push(last);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseRings(body: string): SoilPolygon {
  return splitTop(body).map((ring) =>
    ring.replace(/^\(|\)$/g, '').split(',').map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y] as [number, number];
    }).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
  );
}

/** Clip a ring to a box (Sutherland–Hodgman). Good enough for drawing; holes are clipped on their own. */
export function clipRingToBox(ring: SoilRing, b: SoilBbox): SoilRing {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], c: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= b.w, (a, c) => [b.w, a[1] + ((c[1] - a[1]) * (b.w - a[0])) / (c[0] - a[0])]],
    [(p) => p[0] <= b.e, (a, c) => [b.e, a[1] + ((c[1] - a[1]) * (b.e - a[0])) / (c[0] - a[0])]],
    [(p) => p[1] >= b.s, (a, c) => [a[0] + ((c[0] - a[0]) * (b.s - a[1])) / (c[1] - a[1]), b.s]],
    [(p) => p[1] <= b.n, (a, c) => [a[0] + ((c[0] - a[0]) * (b.n - a[1])) / (c[1] - a[1]), b.n]],
  ];
  let pts = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
  for (const [inside, cross] of edges) {
    if (!pts.length) break;
    const next: SoilRing = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) {
        if (!inside(prev)) next.push(cross(prev, cur));
        next.push(cur);
      } else if (inside(prev)) {
        next.push(cross(prev, cur));
      }
    }
    pts = next;
  }
  if (pts.length < 3) return [];
  return [...pts, pts[0]];
}

export function clipPolygonToBox(poly: SoilPolygon, b: SoilBbox): SoilPolygon | null {
  const outer = clipRingToBox(poly[0], b);
  if (outer.length < 4) return null;
  const holes = poly.slice(1).map((r) => clipRingToBox(r, b)).filter((r) => r.length >= 4);
  return [outer, ...holes];
}

function inRing(x: number, y: number, ring: SoilRing | number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, y: number, poly: SoilPolygon | number[][][]): boolean {
  if (!poly.length || !inRing(x, y, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(x, y, poly[i])) return false;
  return true;
}

/**
 * Share of the field in each map unit, by sampling a grid over the field outline.
 * fieldPolygons: GeoJSON polygon coordinates ([lng, lat] rings). Returns mukey -> fraction (0..1).
 */
export function soilShares(fieldPolygons: number[][][][], features: SoilFeature[], steps = 90): Map<string, number> {
  const box = soilBboxForField(fieldPolygons.flat(), 0);
  const counts = new Map<string, number>();
  if (!box) return counts;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const y = box.s + ((i + 0.5) / steps) * (box.n - box.s);
    for (let j = 0; j < steps; j++) {
      const x = box.w + ((j + 0.5) / steps) * (box.e - box.w);
      if (!fieldPolygons.some((poly) => pointInPolygon(x, y, poly))) continue;
      total++;
      const hit = features.find((f) => f.polygons.some((poly) => pointInPolygon(x, y, poly)));
      if (hit) counts.set(hit.mukey, (counts.get(hit.mukey) ?? 0) + 1);
    }
  }
  const out = new Map<string, number>();
  if (!total) return out;
  for (const [k, v] of counts) out.set(k, v / total);
  return out;
}

/** A point well inside a polygon for its symbol label (grid search for the spot farthest from any edge). */
export function labelPoint(poly: SoilPolygon, steps = 32, prefer?: number[][][][]): [number, number] | null {
  const outer = poly[0];
  if (!outer || outer.length < 4) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of outer) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const kx = Math.cos(((s + n) / 2) * Math.PI / 180); // compare distances in ground units
  let best: [number, number] | null = null, bestD = -1;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = w + (j / steps) * (e - w), y = s + (i / steps) * (n - s);
      if (!pointInPolygon(x, y, poly)) continue;
      // Inside the field beats outside it, so the field's own soils get labels.
      const bonus = prefer?.length && prefer.some((fp) => pointInPolygon(x, y, fp)) ? 1 : 0;
      let d = Infinity;
      for (const ring of poly) {
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) d = Math.min(d, segDist(x, y, ring[b], ring[a], kx));
      }
      const score = d + bonus;
      if (score > bestD) { bestD = score; best = [x, y]; }
    }
  }
  return best;
}

function segDist(px: number, py: number, a: [number, number], b: [number, number], kx: number): number {
  const ax = a[0] * kx, ay = a[1], bx = b[0] * kx, by = b[1], x = px * kx;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (py - ay) * dy) / len)) : 0;
  const cx = ax + t * dx - x, cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

/** Merge rows (one per polygon) into units and features, dropping empties. */
export function buildSoilMap(
  source: SoilMapSource,
  bbox: SoilBbox,
  rows: { mukey: string; musym: string; muname: string; polygons: SoilPolygon[] }[],
): SoilMap {
  const units = new Map<string, SoilUnit>();
  const features = new Map<string, SoilFeature>();
  for (const row of rows) {
    if (!row.mukey || !row.polygons.length) continue;
    if (!units.has(row.mukey)) units.set(row.mukey, { mukey: row.mukey, musym: row.musym || '', muname: row.muname || 'Unnamed map unit' });
    const f = features.get(row.mukey) ?? { mukey: row.mukey, polygons: [] };
    f.polygons.push(...row.polygons);
    features.set(row.mukey, f);
  }
  return { source, bbox, units: [...units.values()], features: [...features.values()] };
}

/** Round coordinates to ~1 m to keep the response small. */
export function roundPolygons(polys: SoilPolygon[]): SoilPolygon[] {
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return polys.map((poly) => poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)] as [number, number])));
}

/**
 * Outline pieces of a ring that are real soil boundaries: segments lying on the
 * request box edge (where the polygon was clipped) are dropped so no box is drawn.
 */
export function boundaryRuns(ring: SoilRing, box: SoilBbox, eps = 2e-5): SoilRing[] {
  const onEdge = (a: [number, number], b: [number, number]) =>
    (Math.abs(a[0] - box.w) < eps && Math.abs(b[0] - box.w) < eps) ||
    (Math.abs(a[0] - box.e) < eps && Math.abs(b[0] - box.e) < eps) ||
    (Math.abs(a[1] - box.s) < eps && Math.abs(b[1] - box.s) < eps) ||
    (Math.abs(a[1] - box.n) < eps && Math.abs(b[1] - box.n) < eps);
  const runs: SoilRing[] = [];
  let cur: SoilRing = [];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    if (onEdge(a, b)) {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
      continue;
    }
    if (!cur.length) cur.push(a);
    cur.push(b);
  }
  if (cur.length >= 2) runs.push(cur);
  // A closed ring split mid-way: join the last run onto the first.
  if (runs.length > 1) {
    const first = runs[0], last = runs[runs.length - 1];
    const lp = last[last.length - 1], fp = first[0];
    if (lp[0] === fp[0] && lp[1] === fp[1]) { runs[0] = [...last, ...first.slice(1)]; runs.pop(); }
  }
  return runs;
}
