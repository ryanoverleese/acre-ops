'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/** Static asset; fetched only the first time the overlay is turned on. */
import { CANALS_SOURCE_LABEL, CANALS_URL } from './canals-source';

export { CANALS_SOURCE_LABEL, CANALS_URL };

/** Corrections Ryan marks on the map. Kept in this browser only (no database writes). */
const FIXES_KEY = 'acre-ops:canal-fixes:v1';
const CANAL_PANE = 'canals';

type CanalProps = {
  name?: string | null;
  type?: string | null;
  county?: string | null;
  length_mi?: number | null;
  source?: string | null;
};

type CanalFix = GeoJSON.Feature<
  GeoJSON.Geometry,
  {
    fix: 'not_there';
    key: string;
    marked_at: string;
    name?: string | null;
    type?: string | null;
    county?: string | null;
    length_mi?: number | null;
  }
>;

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

function readFixes(): CanalFix[] {
  try {
    const raw = window.localStorage.getItem(FIXES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Only "Not there" flags are kept; older sketch entries are ignored.
    return (parsed as CanalFix[]).filter(
      (fix) => fix?.type === 'Feature' && fix.properties?.fix === 'not_there' && typeof fix.properties.key === 'string' && !!fix.geometry,
    );
  } catch {
    return [];
  }
}

function writeFixes(fixes: CanalFix[]) {
  try {
    window.localStorage.setItem(FIXES_KEY, JSON.stringify(fixes));
  } catch {
    // Storage full or blocked; nothing else to do in a preview-only tool.
  }
}

/** Stable identity for a source line, so a "Not there" flag survives reloads. */
function featureKey(feature: GeoJSON.Feature): string {
  const geom = feature.geometry as GeoJSON.LineString | GeoJSON.MultiLineString | null;
  const first = geom?.type === 'LineString'
    ? geom.coordinates[0]
    : geom?.type === 'MultiLineString' ? geom.coordinates[0]?.[0] : undefined;
  const p = (feature.properties ?? {}) as CanalProps;
  return `${p.type ?? ''}|${p.name ?? ''}|${first ? `${first[0]},${first[1]}` : ''}|${p.length_mi ?? ''}`;
}

const esc = (value: string) => value.replace(/[<>&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function isMainCanal(props: CanalProps | undefined) {
  return props?.type === 'canal';
}

function canalStyle(feature: GeoJSON.Feature | undefined, flagged: boolean): L.PathOptions {
  const main = isMainCanal(feature?.properties as CanalProps | undefined);
  // Main canals: bright blue over a thin dark halo (drawn by a separate layer) so they read on satellite.
  const base: L.PathOptions = main
    ? { color: '#3B82F6', weight: 4, opacity: 1 }
    : { color: '#7DB8FF', weight: 2, opacity: 0.95 };
  return flagged ? { ...base, color: '#9CA3AF', dashArray: '6 6', opacity: 0.9 } : { ...base, dashArray: undefined };
}

const HALO_STYLE: L.PathOptions = { color: '#0B1E3F', weight: 6.5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' };

function popupHtml(props: CanalProps, flagged: boolean) {
  const name = props.name?.trim() || (isMainCanal(props) ? 'Unnamed canal' : 'Unnamed lateral');
  const kind = isMainCanal(props) ? 'Canal' : 'Lateral / ditch';
  const miles = typeof props.length_mi === 'number' ? `${props.length_mi.toFixed(2)} mi` : '';
  const source = props.source === 'OSM' ? 'OpenStreetMap' : props.source ? 'USGS NHD' : '';
  const detail = [kind, miles, props.county ?? '', source].filter(Boolean).join(' · ');
  const action = flagged ? 'Undo “Not there”' : 'Not there';
  return `<div class="canal-popup"><div class="canal-popup-name">${esc(name)}</div><div class="canal-popup-detail">${esc(detail)}</div><button type="button" class="canal-popup-flag" data-canal-flag="1">${action}</button></div>`;
}

function downloadFixes(fixes: CanalFix[]) {
  const body: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: fixes };
  const blob = new Blob([JSON.stringify(body, null, 1)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `canal-fixes-${new Date().toISOString().slice(0, 10)}.geojson`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Irrigation canals and laterals over any base map, plus browser-only
 * "Not there" flags that download as GeoJSON. Off by default; data is fetched on first use.
 */
export default function CanalsOverlay({ show }: { show: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const rendererRef = useRef<L.Renderer | null>(null);
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const [fixes, setFixes] = useState<CanalFix[]>([]);
  const fixesRef = useRef<CanalFix[]>([]);
  const barRef = useRef<HTMLDivElement | null>(null);

  const saveFixes = useCallback((next: CanalFix[]) => {
    fixesRef.current = next;
    setFixes(next);
    writeFixes(next);
  }, []);

  useEffect(() => {
    const initial = readFixes();
    fixesRef.current = initial;
    setFixes(initial);
  }, []);

  // Canal lines.
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    loadCanals()
      .then((data) => {
        if (cancelled) return;
        if (!map.getPane(CANAL_PANE)) {
          const pane = map.createPane(CANAL_PANE);
          pane.style.zIndex = '420';
        }
        // Canvas renderer with a generous tolerance so thin laterals are easy to tap.
        const renderer = L.canvas({ pane: CANAL_PANE, tolerance: 8 });
        const isFlagged = (feature?: GeoJSON.Feature) =>
          !!feature && fixesRef.current.some((fix) => fix.properties.fix === 'not_there' && fix.properties.key === featureKey(feature));
        const options: L.GeoJSONOptions & { renderer: L.Renderer } = {
          pane: CANAL_PANE,
          renderer,
          style: (feature) => canalStyle(feature, isFlagged(feature)),
          onEachFeature: (feature, path) => {
            const props = (feature.properties ?? {}) as CanalProps;
            const vector = path as L.Path;
            path.bindPopup(() => popupHtml(props, isFlagged(feature)), {
              className: 'canal-popup-wrap',
              closeButton: false,
              autoPanPadding: [16, 16],
            });
            path.on('click', (event: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(event);
            });
            path.on('popupopen', (event: L.PopupEvent) => {
              const button = event.popup.getElement()?.querySelector<HTMLButtonElement>('[data-canal-flag]');
              if (!button) return;
              button.onclick = (clickEvent) => {
                clickEvent.stopPropagation();
                const key = featureKey(feature);
                const current = fixesRef.current;
                const already = current.some((fix) => fix.properties.fix === 'not_there' && fix.properties.key === key);
                const next: CanalFix[] = already
                  ? current.filter((fix) => !(fix.properties.fix === 'not_there' && fix.properties.key === key))
                  : [
                      ...current,
                      {
                        type: 'Feature',
                        geometry: feature.geometry,
                        properties: {
                          fix: 'not_there',
                          key,
                          marked_at: new Date().toISOString(),
                          name: props.name ?? null,
                          type: props.type ?? null,
                          county: props.county ?? null,
                          length_mi: props.length_mi ?? null,
                        },
                      },
                    ];
                saveFixes(next);
                vector.setStyle(canalStyle(feature, !already));
                path.closePopup();
              };
            });
          },
        };
        const halo = L.geoJSON(data, {
          pane: CANAL_PANE,
          renderer,
          interactive: false,
          filter: (feature) => isMainCanal(feature.properties as CanalProps),
          style: () => HALO_STYLE,
        } as L.GeoJSONOptions & { renderer: L.Renderer });
        const layer = L.geoJSON(data, options);
        const group = L.featureGroup([halo, layer]);
        group.addTo(map);
        groupRef.current = group;
        layerRef.current = layer;
        rendererRef.current = renderer;
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
      layerRef.current = null;
      if (rendererRef.current) {
        map.removeLayer(rendererRef.current);
        rendererRef.current = null;
      }
    };
  }, [show, map, saveFixes]);

  useEffect(() => {
    if (barRef.current) {
      L.DomEvent.disableClickPropagation(barRef.current);
      L.DomEvent.disableScrollPropagation(barRef.current);
    }
  });

  if (!show || fixes.length === 0) return null;

  return createPortal(
    <div className="canal-fix-bar" ref={barRef}>
      <button type="button" onClick={() => downloadFixes(fixes)} title="Download your canal fixes as GeoJSON">
        Canal fixes ({fixes.length})
      </button>
      <button
        type="button"
        className="canal-fix-clear"
        aria-label="Clear canal fixes"
        title="Clear canal fixes saved in this browser"
        onClick={() => {
          if (window.confirm(`Clear ${fixes.length} canal fix${fixes.length === 1 ? '' : 'es'} saved in this browser?`)) {
            saveFixes([]);
            layerRef.current?.eachLayer((child) => {
              const feature = (child as L.Path & { feature?: GeoJSON.Feature }).feature;
              (child as L.Path).setStyle(canalStyle(feature, false));
            });
          }
        }}
      >
        ×
      </button>
    </div>,
    map.getContainer(),
  );
}
