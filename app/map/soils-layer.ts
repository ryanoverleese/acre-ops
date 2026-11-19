'use client';

import L from 'leaflet';
import { boundaryRuns, labelPoint, type SoilMap, type SoilUnit } from '@/lib/soils/ssurgo';
import { closeOpenSoilPopup, consumeSoilTapDismiss, SOIL_POPUP_OPTIONS } from './soil-tap-dismiss';

export const SOILS_MIN_ZOOM = 14;
export const SOILS_MAX_TILES = 9;
export const SOILS_DEBOUNCE_MS = 300;
export const SOILS_PANE = 'acre-soils';
/** Below overlay markers (400) so field/probe taps win; above elevation (350) if that layer is added later. */
export const SOILS_PANE_Z = '390';
const LABEL_MIN_PX = 26;

const SOIL_FILLS = [
  '#c4a574',
  '#8b9a6d',
  '#b8956a',
  '#9a7b5a',
  '#c9b896',
  '#7d8b6a',
  '#a89060',
  '#d4c4a8',
  '#6e7f55',
  '#bba07a',
];

function fillFor(mukey: string): string {
  let h = 0;
  for (let i = 0; i < mukey.length; i++) h = (h * 31 + mukey.charCodeAt(i)) | 0;
  return SOIL_FILLS[Math.abs(h) % SOIL_FILLS.length];
}

const esc = (value: string) => value.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function popupHtml(unit: SoilUnit): string {
  return `<div class="soil-popup"><div class="soil-popup-sym">${esc(unit.musym)}</div><div class="soil-popup-name">${esc(unit.muname)}</div></div>`;
}

function ensurePane(map: L.Map) {
  if (map.getPane(SOILS_PANE)) return;
  const pane = map.createPane(SOILS_PANE);
  pane.style.zIndex = SOILS_PANE_Z;
}

/** Draw SSURGO outlines and light fills for one or more snapped boxes. */
export function drawStaffSoils(map: L.Map, maps: SoilMap[]): L.LayerGroup {
  ensurePane(map);
  const renderer = L.svg({ pane: SOILS_PANE, padding: 0.5 });
  const group = L.layerGroup();
  const labels: { marker: L.Marker; bounds: L.LatLngBounds }[] = [];

  for (const soilMap of maps) {
    const units = new Map(soilMap.units.map((u) => [u.mukey, u]));
    for (const feature of soilMap.features) {
      const unit = units.get(feature.mukey);
      const latlngs = feature.polygons.map((poly) => poly.map((ring) => ring.map(([x, y]) => L.latLng(y, x))));
      const runs = feature.polygons
        .flatMap((poly) => poly.flatMap((ring) => boundaryRuns(ring, soilMap.bbox)))
        .map((run) => run.map(([x, y]) => L.latLng(y, x)));
      const casing = L.polyline(runs, {
        pane: SOILS_PANE, renderer, interactive: false,
        color: '#111111', weight: 3, opacity: 0.45, lineJoin: 'round', lineCap: 'round',
      });
      const outline = L.polyline(runs, {
        pane: SOILS_PANE, renderer, interactive: false,
        color: '#FFFFFF', weight: 1.25, opacity: 0.95, lineJoin: 'round', lineCap: 'round',
      });
      const fill = L.polygon(latlngs, {
        pane: SOILS_PANE, renderer, stroke: false,
        fill: true, fillColor: unit ? fillFor(unit.mukey) : '#c9b896', fillOpacity: 0.28,
      });
      if (unit) {
        fill.bindPopup(popupHtml(unit), SOIL_POPUP_OPTIONS);
        // Replace Leaflet's click-to-open so a second tap can close the popup
        // without immediately opening the soil under the cursor.
        fill.off('click');
        fill.on('click', (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          if (consumeSoilTapDismiss(map)) {
            closeOpenSoilPopup(map);
            return;
          }
          fill.openPopup(event.latlng);
        });
      }
      group.addLayer(fill);
      group.addLayer(casing);
      group.addLayer(outline);

      if (!unit?.musym) continue;
      for (const poly of feature.polygons) {
        const at = labelPoint(poly, 32);
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
  }

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
  fitLabels();
  map.on('zoomend', fitLabels);
  group.on('remove', () => { map.off('zoomend', fitLabels); });
  return group;
}
