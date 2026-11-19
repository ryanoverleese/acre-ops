'use client';

import L from 'leaflet';
import { boundaryRuns, labelPoint, pointInPolygon, type SoilMap, type SoilUnit } from '@/lib/soils/ssurgo';
import { soilFamilyName, soilSeriesColor } from '@/lib/soils/wide';
import { SOILS_PANE, SOILS_PANE_Z } from './soils-layer';

/** Dark casing under the family-colored stroke, so lines stay readable on Elevation. */
const WIDE_CASING_COLOR = '#111111';
const WIDE_CASING_WEIGHT = 3.25;
const WIDE_CASING_OPACITY = 0.75;
/** Family-colored outline. No fill, so the Elevation shading shows through. */
const WIDE_OUTLINE_WEIGHT = 1.85;
const WIDE_OUTLINE_OPACITY = 1;
/** Only label a polygon this big on screen, and keep labels this far apart. */
const LABEL_MIN_W = 120;
const LABEL_MIN_H = 30;
const LABEL_GAP_X = 140;
const LABEL_GAP_Y = 30;
/** The same family is labeled again only this far away, and the screen gets at most MAX_LABELS. */
const SAME_FAMILY_GAP_PX = 360;
const MAX_LABELS = 24;

const esc = (value: string) => value.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function wideSoilPopupHtml(unit: SoilUnit): string {
  const family = soilFamilyName(unit.muname);
  const detail = unit.muname && unit.muname !== family ? `<div class="soil-popup-detail">${esc(unit.muname)}</div>` : '';
  return `<div class="soil-popup"><div class="soil-popup-name soil-popup-family">${esc(family)}</div>${detail}${unit.musym ? `<div class="soil-popup-sym">${esc(unit.musym)}</div>` : ''}</div>`;
}

export type WideSoilsDrawing = {
  group: L.LayerGroup;
  /** Soil map unit under a point, from the tiles on screen. */
  unitAt: (latlng: L.LatLng) => SoilUnit | null;
  /** Soil families in the drawing, most polygons first. */
  families: { name: string; color: string; count: number }[];
};

function ensurePane(map: L.Map) {
  let pane = map.getPane(SOILS_PANE);
  if (!pane) {
    pane = map.createPane(SOILS_PANE);
    pane.style.zIndex = SOILS_PANE_Z;
  }
  return pane;
}

/**
 * Zoomed-out Soils: simplified map units outlined by soil series (one canvas, display only).
 * No fill, so Elevation color shading shows through. Taps are answered by the map
 * click handler through unitAt() (a point inside a polygon, not only on the line),
 * so field and probe taps still win.
 */
export function drawWideSoils(map: L.Map, maps: SoilMap[]): WideSoilsDrawing {
  ensurePane(map);
  const renderer = L.canvas({ pane: SOILS_PANE, padding: 0.3 });
  const group = L.layerGroup();
  const hits: { unit: SoilUnit; bounds: L.LatLngBounds; polygon: SoilMap['features'][number]['polygons'][number] }[] = [];
  type Label = { family: string; bounds: L.LatLngBounds; polygon: SoilMap['features'][number]['polygons'][number]; marker?: L.Marker | null };
  const labels: Label[] = [];
  const familyCount = new Map<string, { color: string; count: number }>();

  for (const soilMap of maps) {
    const units = new Map(soilMap.units.map((u) => [u.mukey, u]));
    for (const feature of soilMap.features) {
      const unit = units.get(feature.mukey);
      if (!unit) continue;
      const color = soilSeriesColor(unit.muname);
      const family = soilFamilyName(unit.muname);
      const fc = familyCount.get(family) ?? { color, count: 0 };
      fc.count += feature.polygons.length;
      familyCount.set(family, fc);

      // Two-tone outlines on real soil boundaries only (not the tile edges).
      // A point-in-polygon hit list, not these lines, answers a tap inside a unit.
      const runs = feature.polygons
        .flatMap((poly) => poly.flatMap((ring) => boundaryRuns(ring, soilMap.bbox, 2e-5)))
        .map((run) => run.map(([x, y]) => L.latLng(y, x)));
      if (runs.length) {
        group.addLayer(L.polyline(runs, {
          pane: SOILS_PANE, renderer, interactive: false,
          color: WIDE_CASING_COLOR, weight: WIDE_CASING_WEIGHT, opacity: WIDE_CASING_OPACITY,
          lineJoin: 'round', lineCap: 'round',
        }));
        group.addLayer(L.polyline(runs, {
          pane: SOILS_PANE, renderer, interactive: false,
          color, weight: WIDE_OUTLINE_WEIGHT, opacity: WIDE_OUTLINE_OPACITY,
          lineJoin: 'round', lineCap: 'round',
        }));
      }
      for (const poly of feature.polygons) {
        const bounds = L.latLngBounds(poly[0].map(([x, y]) => L.latLng(y, x)));
        hits.push({ unit, bounds, polygon: poly });
        labels.push({ family, bounds, polygon: poly });
      }
    }
  }

  // Label point is found only for polygons big enough to label (it is the slow part).
  const markerFor = (label: Label): L.Marker | null => {
    if (label.marker !== undefined) return label.marker;
    const at = labelPoint(label.polygon, 12);
    label.marker = at
      ? L.marker([at[1], at[0]], {
          pane: SOILS_PANE,
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'soil-wide-label', html: `<span>${esc(label.family)}</span>`, iconSize: [0, 0] }),
        })
      : null;
    return label.marker;
  };

  // Biggest polygons claim label spots first; skip any label that would crowd another.
  const placeLabels = () => {
    const shown: L.Point[] = [];
    const byFamily = new Map<string, L.Point[]>();
    const size = map.getSize();
    const sized = labels.map((label) => {
      const a = map.latLngToContainerPoint(label.bounds.getNorthWest());
      const b = map.latLngToContainerPoint(label.bounds.getSouthEast());
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      return { label, w, h, area: w * h };
    }).sort((x, y) => y.area - x.area);
    for (const { label, w, h } of sized) {
      let ok = false;
      let marker: L.Marker | null = null;
      if (w >= LABEL_MIN_W && h >= LABEL_MIN_H) {
        marker = markerFor(label);
        if (marker && shown.length < MAX_LABELS) {
          const p = map.latLngToContainerPoint(marker.getLatLng());
          const same = byFamily.get(label.family) ?? [];
          ok = p.x > 40 && p.y > 12 && p.x < size.x - 40 && p.y < size.y - 12
            && !shown.some((q) => Math.abs(q.x - p.x) < LABEL_GAP_X && Math.abs(q.y - p.y) < LABEL_GAP_Y)
            && !same.some((q) => q.distanceTo(p) < SAME_FAMILY_GAP_PX);
          if (ok) {
            shown.push(p);
            same.push(p);
            byFamily.set(label.family, same);
          }
        }
      }
      const existing = label.marker;
      if (ok && marker) {
        if (!group.hasLayer(marker)) group.addLayer(marker);
      } else if (existing && group.hasLayer(existing)) {
        group.removeLayer(existing);
      }
    }
  };

  group.addTo(map);
  // Display only: the canvas must not swallow taps meant for the map click handler.
  const el = (renderer as unknown as { _container?: HTMLElement })._container;
  if (el) el.style.pointerEvents = 'none';
  placeLabels();
  map.on('zoomend moveend', placeLabels);
  group.on('remove', () => { map.off('zoomend moveend', placeLabels); });

  const unitAt = (latlng: L.LatLng): SoilUnit | null => {
    for (const hit of hits) {
      if (!hit.bounds.contains(latlng)) continue;
      if (pointInPolygon(latlng.lng, latlng.lat, hit.polygon)) return hit.unit;
    }
    return null;
  };

  const families = [...familyCount.entries()]
    .map(([name, v]) => ({ name, color: v.color, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return { group, unitAt, families };
}
