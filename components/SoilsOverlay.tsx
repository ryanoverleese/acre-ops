'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import {
  boundaryRuns,
  labelPoint,
  soilBboxForField,
  soilBboxKey,
  soilShares,
  type SoilMap,
  type SoilUnit,
} from '@/lib/soils/ssurgo';
import { loadSoilMap } from '@/lib/soils/load-map';
import { attachSoilTapDismiss, consumeSoilTapDismiss } from '@/app/map/soil-tap-dismiss';

const SOILS_PANE = 'acre-soils'; // above elevation (350), below canals (420) and pins
const LABEL_MIN_PX = 26; // hide a symbol when its polygon is smaller than this on screen

export type SoilLegendRow = SoilUnit & { share: number };
export type SoilMapState =
  | { status: 'off' | 'loading' | 'error' }
  | { status: 'ready'; map: SoilMap; legend: SoilLegendRow[] };

/** Field outline polygons as GeoJSON coordinates. */
function fieldPolygons(boundaries: FieldBoundaryCollection): number[][][][] {
  const out: number[][][][] = [];
  for (const feature of boundaries.features) {
    const g = feature.geometry as GeoJSON.Geometry | null | undefined;
    if (g?.type === 'Polygon') out.push(g.coordinates as number[][][]);
    else if (g?.type === 'MultiPolygon') out.push(...(g.coordinates as number[][][][]));
  }
  return out;
}

/** Soil map units around a field, fetched the first time Soils is turned on. */
export function useSoilMap(boundaries: FieldBoundaryCollection, show: boolean): SoilMapState {
  const polys = useMemo(() => fieldPolygons(boundaries), [boundaries]);
  const key = useMemo(() => {
    const box = soilBboxForField(polys.flat());
    return box ? soilBboxKey(box) : '';
  }, [polys]);
  const [state, setState] = useState<SoilMapState>({ status: 'off' });

  useEffect(() => {
    if (!show || !key) {
      setState({ status: 'off' });
      return;
    }
    let gone = false;
    setState({ status: 'loading' });
    loadSoilMap(key)
      .then((map) => {
        if (gone) return;
        const shares = soilShares(polys, map.features);
        const legend = map.units
          .map((unit) => ({ ...unit, share: shares.get(unit.mukey) ?? 0 }))
          .filter((row) => row.share >= 0.005)
          .sort((a, b) => b.share - a.share);
        setState({ status: 'ready', map, legend });
      })
      .catch(() => {
        if (!gone) setState({ status: 'error' });
      });
    return () => { gone = true; };
  }, [show, key, polys]);

  return state;
}

const esc = (value: string) => value.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * SSURGO map unit outlines and symbols, drawn over whatever base is on
 * (satellite or elevation). Thin light lines on a dark casing, no fill, so
 * the elevation colors stay readable underneath.
 */
export default function SoilsOverlay({ state, boundaries }: { state: SoilMapState; boundaries: FieldBoundaryCollection }) {
  const fieldPolys = useMemo(() => fieldPolygons(boundaries), [boundaries]);
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const soilMap = state.status === 'ready' ? state.map : null;

  useEffect(() => {
    if (!soilMap) return;
    if (!map.getPane(SOILS_PANE)) {
      const pane = map.createPane(SOILS_PANE);
      pane.style.zIndex = '400';
    }
    const units = new Map(soilMap.units.map((u) => [u.mukey, u]));
    const renderer = L.svg({ pane: SOILS_PANE, padding: 0.5 });
    const group = L.layerGroup();
    const labels: { marker: L.Marker; bounds: L.LatLngBounds }[] = [];

    for (const feature of soilMap.features) {
      const unit = units.get(feature.mukey);
      const latlngs = feature.polygons.map((poly) => poly.map((ring) => ring.map(([x, y]) => L.latLng(y, x))));
      // Lines follow real soil boundaries only (not the edge of the requested box).
      const runs = feature.polygons.flatMap((poly) => poly.flatMap((ring) => boundaryRuns(ring, soilMap.bbox)))
        .map((run) => run.map(([x, y]) => L.latLng(y, x)));
      const casing = L.polyline(runs, {
        pane: SOILS_PANE, renderer, interactive: false,
        color: '#111111', weight: 3, opacity: 0.45, lineJoin: 'round', lineCap: 'round',
      });
      const outline = L.polyline(runs, {
        pane: SOILS_PANE, renderer, interactive: false,
        color: '#FFFFFF', weight: 1.25, opacity: 0.95, lineJoin: 'round', lineCap: 'round',
      });
      // Invisible fill so a tap inside a unit shows its name.
      const line = L.polygon(latlngs, {
        pane: SOILS_PANE, renderer, stroke: false,
        fill: true, fillColor: '#FFFFFF', fillOpacity: 0,
      });
      if (unit) {
        line.bindPopup(
          `<div class="soil-popup"><div class="soil-popup-sym">${esc(unit.musym)}</div><div class="soil-popup-name">${esc(unit.muname)}</div></div>`,
          { className: 'canal-popup-wrap', closeButton: false, autoPanPadding: [16, 16] },
        );
        // Same second-tap close as the staff map: Leaflet closes on preclick,
        // so drop the default click-to-open and skip the reopen.
        line.off('click');
        line.on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          if (consumeSoilTapDismiss(map)) return;
          line.openPopup(event.latlng);
        });
      }
      group.addLayer(line);
      group.addLayer(casing);
      group.addLayer(outline);

      if (!unit?.musym) continue;
      for (const poly of feature.polygons) {
        const at = labelPoint(poly, 32, fieldPolys);
        if (!at) continue;
        const marker = L.marker([at[1], at[0]], {
          pane: SOILS_PANE,
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'soil-label', html: `<span>${esc(unit.musym)}</span>`, iconSize: [0, 0] }),
        });
        labels.push({ marker, bounds: L.latLngBounds(poly[0].map(([x, y]) => L.latLng(y, x))) });
        group.addLayer(marker);
      }
    }

    // Only label polygons big enough on screen to hold their symbol.
    const fitLabels = () => {
      for (const { marker, bounds } of labels) {
        const a = map.latLngToContainerPoint(bounds.getNorthWest());
        const b = map.latLngToContainerPoint(bounds.getSouthEast());
        const big = Math.abs(b.x - a.x) >= LABEL_MIN_PX && Math.abs(b.y - a.y) >= LABEL_MIN_PX * 0.7;
        const el = marker.getElement();
        if (el) el.style.display = big ? '' : 'none';
      }
    };
    group.addTo(map);
    groupRef.current = group;
    const detachDismiss = attachSoilTapDismiss(map);
    fitLabels();
    map.on('zoomend', fitLabels);
    return () => {
      map.off('zoomend', fitLabels);
      detachDismiss();
      group.remove();
      groupRef.current = null;
    };
  }, [map, soilMap, fieldPolys]);

  return null;
}
