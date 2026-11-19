/**
 * Low spots and flow paths from a bare-earth DEM grid.
 *
 * Pure math, no Leaflet or DOM, so it runs in the browser and in tests.
 *
 * 1. Priority-Flood (Barnes, Lehman & Mulla 2014) fills every closed
 *    depression to its spill height. Depth = filled − ground.
 * 2. The same flood gives each cell a downhill neighbor (D8). Cells inside a
 *    depression or on a flat point back toward the cell that reached them,
 *    so water routes across a pond to its spill point.
 * 3. Flow accumulation counts the cells that drain through each cell.
 *    Cells above an area threshold are traced into polylines.
 *
 * Grid row 0 is north (ArcGIS exportImage order). NaN is no-data and acts as
 * an outlet, like the grid edge.
 */

export type LowSpotsInput = {
  elev: Float32Array;
  width: number;
  height: number;
  /** Ground size of one cell, meters. */
  cellM: number;
};

export type LowSpotsOptions = {
  /** Shade cells at least this deep, meters. Default 0.03 (about 0.1 ft). */
  minShadeDepthM?: number;
  /** Drop a depression whose deepest cell is shallower than this, meters. Default 0.06. */
  minPondDepthM?: number;
  /** Drop a depression smaller than this, square meters. Default 100. */
  minPondAreaM2?: number;
  /** Draw a flow line where at least this much land drains through, square meters. */
  flowAreaM2?: number;
};

export type FlowLine = {
  /** [col, row] cell centers, upstream first. */
  pts: Array<[number, number]>;
  /** Largest drained area along the line, square meters. */
  areaM2: number;
};

export type LowSpotsResult = {
  width: number;
  height: number;
  /** Depth of kept depressions in meters; 0 where none. */
  depth: Float32Array;
  maxDepthM: number;
  /** Count of kept depressions. */
  ponds: number;
  lines: FlowLine[];
  flowAreaM2: number;
};

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

/** Default flow-line threshold: about 2.5 acres, and at least 800 cells on coarse grids. */
export function defaultFlowAreaM2(cellM: number): number {
  return Math.max(10_000, 800 * cellM * cellM);
}

class MinHeap {
  private keys: Float64Array;
  private ids: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.ids = new Int32Array(cap);
  }
  push(key: number, id: number) {
    let i = this.size++;
    const k = this.keys;
    const d = this.ids;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      d[i] = d[p];
      i = p;
    }
    k[i] = key;
    d[i] = id;
  }
  pop(): number {
    const k = this.keys;
    const d = this.ids;
    const top = d[0];
    const n = --this.size;
    if (n > 0) {
      const key = k[n];
      const id = d[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c];
        d[i] = d[c];
        i = c;
      }
      k[i] = key;
      d[i] = id;
    }
    return top;
  }
}

export function computeLowSpots(input: LowSpotsInput, opts: LowSpotsOptions = {}): LowSpotsResult {
  const { elev, width: w, height: h, cellM } = input;
  const n = w * h;
  if (elev.length !== n || w < 3 || h < 3 || !(cellM > 0)) {
    throw new Error('lowspots: bad grid');
  }
  const minShade = opts.minShadeDepthM ?? 0.03;
  const minPondDepth = opts.minPondDepthM ?? 0.06;
  const minPondCells = Math.max(1, Math.round((opts.minPondAreaM2 ?? 100) / (cellM * cellM)));
  const flowAreaM2 = opts.flowAreaM2 ?? defaultFlowAreaM2(cellM);
  const flowCells = Math.max(2, flowAreaM2 / (cellM * cellM));

  const filled = new Float32Array(n);
  const dir = new Int8Array(n).fill(-1); // 0..7 neighbor index, -1 outlet
  const state = new Uint8Array(n); // 0 new, 1 queued, 2 no-data
  const order = new Int32Array(n);
  let popped = 0;

  const heap = new MinHeap(n);
  const pit = new Int32Array(n);
  let pitHead = 0;
  let pitTail = 0;

  // Seed: grid edge and any cell next to no-data drain off the map.
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(elev[i])) state[i] = 2;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (state[i] !== 0) continue;
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (!edge) {
        for (let k = 0; k < 8; k++) {
          if (state[(y + DY[k]) * w + x + DX[k]] === 2) { edge = true; break; }
        }
      }
      if (edge) {
        filled[i] = elev[i];
        state[i] = 1;
        heap.push(elev[i], i);
      }
    }
  }

  // Priority-Flood with a FIFO for cells that sit in a pit or flat.
  while (pitHead < pitTail || heap.size > 0) {
    const c = pitHead < pitTail ? pit[pitHead++] : heap.pop();
    order[popped++] = c;
    const cx = c % w;
    const cy = (c - cx) / w;
    const fc = filled[c];
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k];
      const y = cy + DY[k];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (state[j] !== 0) continue;
      state[j] = 1;
      if (elev[j] <= fc) {
        filled[j] = fc;
        dir[j] = (k + 4) & 7; // back toward c
        pit[pitTail++] = j;
      } else {
        filled[j] = elev[j];
        heap.push(elev[j], j);
      }
    }
  }

  // Cells raised above their reacher: steepest strictly-lower filled neighbor.
  // Lower filled means popped earlier, so the graph has no cycles.
  for (let i = 0; i < n; i++) {
    if (state[i] === 2 || dir[i] !== -1) continue;
    const cx = i % w;
    const cy = (i - cx) / w;
    const fi = filled[i];
    let best = 0;
    let bestK = -1;
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k];
      const y = cy + DY[k];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (state[j] === 2) continue;
      const drop = (fi - filled[j]) / ((k & 1) ? Math.SQRT2 : 1);
      if (drop > best) { best = drop; bestK = k; }
    }
    dir[i] = bestK;
  }

  // Flow accumulation in reverse pop order (every cell drains to an earlier one).
  const acc = new Float32Array(n);
  for (let p = popped - 1; p >= 0; p--) {
    const i = order[p];
    acc[i] += 1;
    const k = dir[i];
    if (k < 0) continue;
    acc[i + DY[k] * w + DX[k]] += acc[i];
  }

  // Depressions: keep connected pits that are deep and big enough.
  const depth = new Float32Array(n);
  // Ponds big enough that flow lines stop at their edge (half an acre).
  const bigPond = new Uint8Array(n);
  const bigPondCells = Math.max(40, 2000 / (cellM * cellM));
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let ponds = 0;
  let maxDepthM = 0;
  const members: number[] = [];
  for (let i = 0; i < n; i++) {
    if (label[i] !== 0 || state[i] === 2 || filled[i] - elev[i] <= 0) continue;
    // Flood one pond: same spill level, depth > 0.
    const level = filled[i];
    label[i] = -1;
    let top = 0;
    stack[top++] = i;
    members.length = 0;
    let deepest = 0;
    while (top > 0) {
      const c = stack[--top];
      members.push(c);
      const d = filled[c] - elev[c];
      if (d > deepest) deepest = d;
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let k = 0; k < 8; k++) {
        const x = cx + DX[k];
        const y = cy + DY[k];
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        if (label[j] !== 0 || state[j] === 2) continue;
        if (filled[j] !== level || filled[j] - elev[j] <= 0) continue;
        label[j] = -1;
        stack[top++] = j;
      }
    }
    if (deepest < minPondDepth || members.length < minPondCells) continue;
    ponds++;
    if (deepest > maxDepthM) maxDepthM = deepest;
    const big = members.length >= bigPondCells ? 1 : 0;
    for (const c of members) {
      const d = filled[c] - elev[c];
      if (d >= minShade) depth[c] = d;
      bigPond[c] = big;
    }
  }

  // Flow lines: trace stream cells between heads, confluences and outlets.
  const isStream = (i: number) => state[i] !== 2 && acc[i] >= flowCells;
  const inflow = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!isStream(i)) continue;
    const k = dir[i];
    if (k < 0) continue;
    inflow[i + DY[k] * w + DX[k]]++;
  }
  const lines: FlowLine[] = [];
  const area = cellM * cellM;
  const cells: number[] = [];
  const emit = (from: number, to: number) => {
    if (to - from < 1) return;
    const pts: Array<[number, number]> = [];
    let maxAcc = 0;
    for (let p = from; p <= to; p++) {
      const c = cells[p];
      const x = c % w;
      pts.push([x, (c - x) / w]);
      if (acc[c] > maxAcc) maxAcc = acc[c];
    }
    lines.push({ pts, areaM2: maxAcc * area });
  };
  for (let i = 0; i < n; i++) {
    if (!isStream(i) || inflow[i] === 1) continue;
    cells.length = 0;
    let c = i;
    for (;;) {
      cells.push(c);
      const k = dir[c];
      if (k < 0) break;
      c += DY[k] * w + DX[k];
      if (inflow[c] !== 1) { cells.push(c); break; }
    }
    // Inside a big pond the routing is arbitrary (straight runs to the spill
    // point), so draw only the parts outside it, each touching the pond edge.
    // Small pits along a ditch do not break the line.
    let start = -1;
    for (let p = 0; p < cells.length; p++) {
      const wet = bigPond[cells[p]] === 1;
      if (!wet && start < 0) start = p > 0 ? p - 1 : p;
      if (wet && start >= 0) { emit(start, p); start = -1; }
    }
    if (start >= 0) emit(start, cells.length - 1);
  }

  return { width: w, height: h, depth, maxDepthM, ponds, lines, flowAreaM2 };
}
