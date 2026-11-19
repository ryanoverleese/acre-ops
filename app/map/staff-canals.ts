'use client';

import L from 'leaflet';
import { CANALS_URL } from '@/components/canals-source';

/**
 * Irrigation canals and laterals for the staff Map page (same static asset and
 * styling as the field maps). View only: no correction or sketch tools here.
 */
export const STAFF_CANALS_PANE = 'acre-canals';
/** Above field outlines (399) and circle markers (400), below marker icons (600) and popups. */
export const STAFF_CANALS_PANE_Z = '410';

type CanalProps = { name?: string | null; type?: string | null; county?: string | null; length_mi?: number | null; source?: string | null };

let cached: Promise<GeoJSON.FeatureCollection> | null = null;
function loadCanals(): Promise<GeoJSON.FeatureCollection> {
  if (!cached) {
    cached = fetch(CANALS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Canals overlay failed to load (${res.status})`);
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

const esc = (value: string) => value.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const isMain = (p?: CanalProps) => p?.type === 'canal';

export function canalPopupHtml(props: CanalProps): string {
  const name = props.name?.trim() || (isMain(props) ? 'Unnamed canal' : 'Unnamed lateral');
  const kind = isMain(props) ? 'Canal' : 'Lateral / ditch';
  const miles = typeof props.length_mi === 'number' ? `${props.length_mi.toFixed(2)} mi` : '';
  const source = props.source === 'OSM' ? 'OpenStreetMap' : props.source ? 'USGS NHD' : '';
  const detail = [kind, miles, props.county ?? '', source].filter(Boolean).join(' · ');
  return `<div class="canal-popup"><div class="canal-popup-name">${esc(name)}</div><div class="canal-popup-detail">${esc(detail)}</div></div>`;
}

export type StaffCanalsHandle = { detach: () => void };

export function attachStaffCanals(map: L.Map, onStatus?: (status: 'loading' | 'ready' | 'error') => void): StaffCanalsHandle {
  let pane = map.getPane(STAFF_CANALS_PANE);
  if (!pane) {
    pane = map.createPane(STAFF_CANALS_PANE);
    pane.style.zIndex = STAFF_CANALS_PANE_Z;
  }
  // Only the canal lines themselves take taps; the rest of the pane lets taps through.
  pane.style.pointerEvents = 'none';
  let group: L.FeatureGroup | null = null;
  let dead = false;
  onStatus?.('loading');
  loadCanals()
    .then((data) => {
      if (dead) return;
      const renderer = L.svg({ pane: STAFF_CANALS_PANE });
      const halo = L.geoJSON(data, {
        pane: STAFF_CANALS_PANE, renderer, interactive: false,
        filter: (feature) => isMain(feature.properties as CanalProps),
        style: () => ({ color: '#0B1E3F', weight: 6.5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }),
      } as L.GeoJSONOptions & { renderer: L.Renderer });
      const lines = L.geoJSON(data, {
        pane: STAFF_CANALS_PANE, renderer, interactive: false,
        style: (feature) => (isMain(feature?.properties as CanalProps)
          ? { color: '#3B82F6', weight: 4, opacity: 1 }
          : { color: '#7DB8FF', weight: 2, opacity: 0.95 }),
      } as L.GeoJSONOptions & { renderer: L.Renderer });
      // Wide invisible stroke so thin laterals are easy to tap.
      const hit = L.geoJSON(data, {
        pane: STAFF_CANALS_PANE, renderer, interactive: true,
        style: () => ({ color: '#000000', weight: 14, opacity: 0 }),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(canalPopupHtml((feature.properties ?? {}) as CanalProps), {
            className: 'canal-popup-wrap', closeButton: false, autoPanPadding: [16, 16],
          });
          layer.on('click', (event: L.LeafletMouseEvent) => L.DomEvent.stopPropagation(event));
        },
      } as L.GeoJSONOptions & { renderer: L.Renderer });
      group = L.featureGroup([halo, lines, hit]).addTo(map);
      onStatus?.('ready');
    })
    .catch(() => {
      if (!dead) onStatus?.('error');
    });
  return {
    detach: () => {
      dead = true;
      group?.remove();
      group = null;
    },
  };
}
