import L from 'leaflet';
import * as Lerc from 'lerc';
import {
  buildSpreadMap,
  colorScaleForTile,
  fieldElevationBounds,
  fieldReliefMeters,
  isUsableRange,
  rangeFromSamples,
  type ElevRange,
  type SpreadMap,
} from './color-scale';
import {
  elevationRequestPath,
  elevationsInsideField,
  type LngLatRing,
} from './elevation-request';
import {
  ELEV_GRID,
  TILE,
  TILE_HALO,
  clampReliefStrength,
  paintElevationTile,
  type ElevPaintMode,
} from './paint-elev';

export type ElevRenderMode = ElevPaintMode;

const N = ELEV_GRID; // 256 + 1px halo on each side for slope neighbors
/** Fixed grid for the field sample. Independent of the map zoom. */
const FIELD_SAMPLE = 96;
const FT = 0.3048;

type Range = ElevRange;

/** Tile zoom is the integer GridLayer uses. Fractional map zoom only scales these tiles. */
function tileBBox(coords: L.Coords) {
  const world = 40075016.68557849;
  const size = world / Math.pow(2, coords.z);
  const px = size / TILE;
  const minX = -world / 2 + coords.x * size - px * TILE_HALO;
  const maxX = minX + size + 2 * px * TILE_HALO;
  const maxY = world / 2 - coords.y * size + px * TILE_HALO;
  const minY = maxY - size - 2 * px * TILE_HALO;
  const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 0.5) / Math.pow(2, coords.z))));
  return { bbox: [minX, minY, maxX, maxY] as [number, number, number, number], cell: px * Math.cos(latC) };
}

function latLngBoundsTo3857(b: L.LatLngBounds): [number, number, number, number] {
  const sw = L.CRS.EPSG3857.project(b.getSouthWest());
  const ne = L.CRS.EPSG3857.project(b.getNorthEast());
  return [sw.x, sw.y, ne.x, ne.y];
}

export function exportUrl(bbox: number[], width: number, height: number): string {
  const box = bbox.map((v) => v.toFixed(3)).join(',');
  const query = 'f=image&format=lerc&pixelType=F32&bboxSR=3857&imageSR=3857'
    + `&bbox=${box}&size=${width},${height}&interpolation=RSP_BilinearInterpolation`;
  return `${elevationRequestPath(bbox, width, height)}?${query}`;
}

function boundsIdentity(bounds: L.LatLngBounds | null, rings: LngLatRing[] | null): string {
  const box = bounds && bounds.isValid() ? bounds.toBBoxString() : '';
  const ringKey = (rings ?? [])
    .map((ring) => ring.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';'))
    .join('|');
  return `${box}#${ringKey}`;
}

let lercReady: Promise<void> | null = null;
export function ensureLerc() {
  if (!lercReady) {
    lercReady = Lerc.load({
      locateFile: (name) => (name.endsWith('.wasm') ? '/lerc-wasm.wasm' : name),
    });
  }
  return lercReady;
}

type ElevTile = HTMLCanvasElement & {
  _elev?: Float32Array;
  _cell?: number;
  _z?: number;
  _tileY?: number;
  _dead?: boolean;
  _abort?: AbortController | null;
};

export type ElevColorOptions = {
  /** When set, every tile uses this stretch instead of the auto sample. */
  manualRange?: ElevRange | null;
  /** Histogram-equalize colors by land area in the (clipped) sample. */
  spread?: boolean;
  /** 0..1 hillshade strength. Omit for the default (a56e1e1) look. */
  relief?: number | null;
};

export type ElevGridOptions = {
  mode: ElevRenderMode;
  opacity: number;
  pane: string;
  /** Whole-field elevation min/max. Tiles never substitute their own. */
  range?: Range;
  /** Boundary envelope. One fixed sample of this box is the color scale for every tile. */
  fieldBounds?: L.LatLngBounds | null;
  /** [lng, lat] rings. Samples outside these rings do not affect the color scale. */
  fieldRings?: LngLatRing[] | null;
  /**
   * Display hook. Called with the same field scale passed to colorScaleForTile.
   * Does not change sampling, coloring, or the elevation request.
   */
  onFieldScale?: (range: Range | null) => void;
  /** True max−min of the clipped field sample, in meters. Display only. */
  onFieldRelief?: (meters: number | null) => void;
  color?: ElevColorOptions;
};

export type ElevGridLayer = L.GridLayer & {
  setElevMode: (mode: ElevRenderMode) => void;
  setFieldBounds: (bounds: L.LatLngBounds | null, rings?: LngLatRing[] | null) => void;
  setColorOptions: (color: ElevColorOptions) => void;
  rerender: () => void;
};

function renderCanvas(
  tile: ElevTile,
  mode: ElevRenderMode,
  fieldScale: Range | null,
  spreadMap: SpreadMap | null,
  relief: number,
) {
  const elev = tile._elev;
  if (!elev || tile._z == null || tile._tileY == null) return;
  const ctx = tile.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(TILE, TILE);
  paintElevationTile(img.data, elev, {
    mode,
    fieldScale,
    spreadMap,
    z: tile._z,
    tileY: tile._tileY,
    relief,
  });
  ctx.putImageData(img, 0, 0);
}

export function createElevGridLayer(options: ElevGridOptions): ElevGridLayer {
  const owned = new Set<ElevTile>();
  const state = {
    mode: options.mode,
    fieldScale: options.range && options.range.hi > options.range.lo ? options.range : null as Range | null,
    fieldBounds: options.fieldBounds ?? null,
    fieldRings: options.fieldRings ?? null,
    boundsKey: '',
    fieldAbort: null as AbortController | null,
    fieldGen: 0,
    onFieldScale: options.onFieldScale,
    onFieldRelief: options.onFieldRelief,
    manualRange: options.color?.manualRange && isUsableRange(options.color.manualRange)
      ? options.color.manualRange
      : null as Range | null,
    spread: options.color?.spread === true,
    relief: clampReliefStrength(options.color?.relief),
    sampleValues: null as number[] | null,
    spreadMap: null as SpreadMap | null,
    activeScale: null as Range | null,
  };

  const applyColor = () => {
    const auto = state.fieldScale;
    const manual = state.manualRange && isUsableRange(state.manualRange) ? state.manualRange : null;
    const scale = manual ?? auto;
    state.activeScale = scale;
    if (state.spread && state.sampleValues && scale) {
      state.spreadMap = buildSpreadMap(state.sampleValues, scale);
    } else {
      state.spreadMap = null;
    }
  };
  applyColor();

  const Layer = L.GridLayer.extend({
    options: {
      pane: options.pane,
      opacity: options.opacity,
      tileSize: TILE,
      maxZoom: 20,
      keepBuffer: 2,
      updateWhenZooming: false,
      attribution: 'Elevation: USGS 3DEP',
    },
    onAdd(map: L.Map) {
      L.GridLayer.prototype.onAdd.call(this, map);
      this._loadFieldScale();
    },
    onRemove(map: L.Map) {
      state.fieldAbort?.abort();
      state.fieldAbort = null;
      owned.clear();
      L.GridLayer.prototype.onRemove.call(this, map);
    },
    _removeTile(key: string) {
      const tiles = (this as unknown as { _tiles: Record<string, { el: ElevTile }> })._tiles || {};
      const el = tiles[key]?.el;
      if (el) {
        el._dead = true;
        el._abort?.abort();
        owned.delete(el);
      }
      (L.GridLayer.prototype as unknown as { _removeTile(this: unknown, key: string): void })._removeTile.call(this, key);
    },
    // Leaflet's _tiles map drops canvases during zoom animation. This set is
    // every canvas we still own, so a late field scale repaints all of them.
    _paintLoaded() {
      for (const el of owned) {
        if (el._dead || !el._elev) continue;
        renderCanvas(el, state.mode, state.activeScale, state.spreadMap, state.relief);
      }
    },
    _loadFieldScale() {
      const bounds = state.fieldBounds;
      state.boundsKey = boundsIdentity(bounds, state.fieldRings);
      state.fieldAbort?.abort();
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      state.fieldAbort = ac;
      const gen = ++state.fieldGen;
      if (!bounds || !bounds.isValid()) return;

      const bbox = latLngBoundsTo3857(bounds);
      const url = exportUrl(bbox, FIELD_SAMPLE, FIELD_SAMPLE);

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          const d = Lerc.decode(buf);
          if (d.width !== FIELD_SAMPLE || d.height !== FIELD_SAMPLE) throw new Error('field sample size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(d.width * d.height);
          for (let p = 0; p < elev.length; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > 0 && v < 9000) ? NaN : v;
          }
          let values = elevationsInsideField(elev, d.width, d.height, bbox, state.fieldRings);
          if (values.length < 8) {
            values = elevationsInsideField(elev, d.width, d.height, bbox, null);
          }
          const sample = rangeFromSamples(values);
          const display = fieldElevationBounds(values);
          if (!sample || !display) return;
          // One scale for every tile at every zoom. Tile min/max is never used.
          // The legend uses the unpadded field min/max, not a tile extent.
          state.fieldScale = colorScaleForTile(null, sample);
          state.sampleValues = values;
          applyColor();
          state.onFieldScale?.(display);
          state.onFieldRelief?.(fieldReliefMeters(values));
          this._paintLoaded();
        })
        .catch((err) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          if (err?.name === 'AbortError') return;
          // Leave the previous field scale in place. Do not color from a tile.
        });
    },
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement('canvas') as ElevTile;
      tile.width = TILE;
      tile.height = TILE;
      tile._z = coords.z;
      tile._tileY = coords.y;
      owned.add(tile);
      const bb = tileBBox(coords);
      tile._cell = bb.cell;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      tile._abort = ac;

      const url = exportUrl(bb.bbox, N, N);

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          tile._abort = null;
          if (tile._dead) return;
          const d = Lerc.decode(buf);
          if (d.width !== N || d.height !== N) throw new Error('size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(N * N);
          for (let p = 0; p < N * N; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > 0 && v < 9000) ? NaN : v;
          }
          tile._elev = elev;
          // Same field scale at every zoom. A tile never stretches its own min/max.
          if (state.activeScale) renderCanvas(tile, state.mode, state.activeScale, state.spreadMap, state.relief);
          done(undefined, tile);
        })
        .catch((err) => {
          tile._abort = null;
          if (err?.name === 'AbortError') return;
          done(undefined, tile);
        });

      return tile;
    },
    setElevMode(mode: ElevRenderMode) {
      state.mode = mode;
      this.rerender();
    },
    setColorOptions(color: ElevColorOptions) {
      state.manualRange = color.manualRange && isUsableRange(color.manualRange) ? color.manualRange : null;
      state.spread = color.spread === true;
      state.relief = clampReliefStrength(color.relief);
      applyColor();
      this._paintLoaded();
    },
    setFieldBounds(bounds: L.LatLngBounds | null, rings?: LngLatRing[] | null) {
      const nextRings = rings === undefined ? state.fieldRings : rings;
      const key = boundsIdentity(bounds, nextRings);
      if (key === state.boundsKey && state.fieldScale) return;
      state.fieldBounds = bounds;
      state.fieldRings = nextRings;
      // Keep the current scale until the new sample arrives so a zoom
      // cannot clear it and leave tiles to invent their own.
      this._loadFieldScale();
    },
    rerender() {
      this._paintLoaded();
    },
  });

  return new Layer() as ElevGridLayer;
}

/** Convert meters ↔ feet helpers for range display. */
export function metersToFeet(m: number) { return m / FT; }
export function feetToMeters(ft: number) { return ft * FT; }
