'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { zoneBounds, zoneCenter, CENTER_LAT, CENTER_LNG } from '@/lib/territory-grid';
import type { LatBand } from '@/lib/territory-grid';
import { useFieldBoundaries } from '@/components/useFieldBoundaries';
import { loadSoilMap, loadWideSoilMap } from '@/lib/soils/load-map';
import { WIDE_MAX_TILES, WIDE_MIN_ZOOM, wideTileKeysForView } from '@/lib/soils/wide';
import { soilBboxKeysForView } from '@/lib/soils/ssurgo';
import type { ElevRange } from '@/lib/terrain/color-scale';
import type { TerrainMode } from '@/lib/terrain/modes';
import { drawStaffSoils, SOILS_DEBOUNCE_MS, SOILS_MAX_TILES, SOILS_MIN_ZOOM } from './soils-layer';
import { attachSoilTapDismiss, closeOpenSoilPopup, consumeSoilTapDismiss, SOIL_POPUP_OPTIONS } from './soil-tap-dismiss';
import { drawWideSoils, wideSoilPopupHtml, type WideSoilsDrawing } from './soils-wide-layer';
import { attachStaffCanals, type StaffCanalsHandle } from './staff-canals';
import { attachStaffLowSpots, type StaffLowSpotsHandle } from './staff-lowspots';
import type { LowSpotsStatus } from '@/lib/terrain/lowspots-layer';
import { attachStaffElevation, DEFAULT_ELEV_OPACITY, type StaffElevColor, type StaffElevationHandle } from './elevation-layer';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
// Roads and place names only (transparent), drawn above Elevation and Soils.
const LABELS_URL = 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}';
const LABELS_PANE = 'acre-labels';
// Just below the default overlay pane (400) so probe/placement markers stay tappable.
const FIELDS_PANE = 'acre-fields';

export interface MapField {
  id: number;
  name: string;
  operation: string;
  lat?: number;
  lng?: number;
  acres?: number;
  crop?: string;
  /** Default probe-placement pin. Off-season bounded fields leave this false. */
  showPlacementPin?: boolean;
}

export interface MapProbe {
  id: number;
  label: string;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  status: string;
  plantingDate?: string;  // YYYY-MM-DD
}

export interface MapRepair {
  id: number;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  problem?: string;
  fix?: string;
  repairedAt?: string;
}

export interface MapOperation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  fieldCount: number;
}

export interface MapCell {
  band: LatBand;
  col: number;   // signed 1-based: +east, -west
  name: string;  // e.g. "M1E", "N2W"
  fieldCount: number;
  probeCount: number;
  isHome: boolean;
}

/** 'wide': zoomed out, showing simplified soil families instead of the detailed map units. */
export type SoilsViewStatus = 'off' | 'zoom' | 'loading' | 'ready' | 'wide' | 'error';
export type SoilFamilyLegendRow = { name: string; color: string };

export interface Layers {
  fields: boolean;
  probes: boolean;
  plantDays: boolean;
  repairs: boolean;
  customers: boolean;
  territory: boolean;
  canals: boolean;
  soils: boolean;
  lowSpots: boolean;
}

interface Props {
  fields: MapField[];
  probes: MapProbe[];
  plantDaysProbes: MapProbe[];
  repairs: MapRepair[];
  operations: MapOperation[];
  cells: MapCell[];
  layers: Layers;
  center: [number, number];
  zoom: number;
  onSoilsStatus?: (status: SoilsViewStatus) => void;
  /** Most common soil families in the zoomed-out view (empty otherwise). */
  onSoilFamilies?: (rows: SoilFamilyLegendRow[]) => void;
  onLowSpotsStatus?: (status: LowSpotsStatus) => void;
  elevationMode?: TerrainMode;
  onElevationRange?: (range: ElevRange | null) => void;
  elevColor?: StaffElevColor;
  elevOpacity?: number;
}

const STATUS_COLORS: Record<string, string> = {
  installed: '#4a7a5b',
  planned: '#f59e0b',
  removed: '#6b7280',
  damaged: '#ef4444',
};

function statusColor(status: string): string {
  const key = status.toLowerCase();
  return STATUS_COLORS[key] ?? '#4a7a5b';
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86_400_000);
}

function probeDaysColor(plantingDate?: string): string {
  const days = daysSince(plantingDate);
  if (days === null) return '#c7c7cc';   // no date — gray
  if (days > 26)    return '#2F6BB0';   // getting late — blue
  if (days >= 16)   return '#34c759';   // ideal — green
  return '#ff3b30';                      // too early — red
}

function fieldPopupHtml(field: MapField): string {
  return `<b>${field.name}</b><br>${field.operation}${field.acres ? `<br>${field.acres} ac` : ''}${field.crop ? `<br>${field.crop}` : ''}`;
}

export default function UnifiedMap({ fields, probes, plantDaysProbes, repairs, operations, cells, layers, center, zoom, onSoilsStatus, onSoilFamilies, onLowSpotsStatus, elevationMode = 'off', onElevationRange, elevColor, elevOpacity }: Props) {
  const boundaries = useFieldBoundaries(fields.map(field => field.id));
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<{
    fields: L.LayerGroup;
    probes: L.LayerGroup;
    plantDays: L.LayerGroup;
    repairs: L.LayerGroup;
    customers: L.LayerGroup;
    territory: L.LayerGroup;
  } | null>(null);
  const soilsGroupRef = useRef<L.LayerGroup | null>(null);
  const soilsStatusRef = useRef(onSoilsStatus);
  soilsStatusRef.current = onSoilsStatus;
  const soilFamiliesRef = useRef(onSoilFamilies);
  soilFamiliesRef.current = onSoilFamilies;
  const elevCtlRef = useRef<StaffElevationHandle | null>(null);
  const elevRangeRef = useRef(onElevationRange);
  elevRangeRef.current = onElevationRange;
  const elevColorRef = useRef(elevColor);
  elevColorRef.current = elevColor;
  const elevOpacityRef = useRef(elevOpacity);
  elevOpacityRef.current = elevOpacity;

  // Fly to computed center when it changes (after data loads)
  useEffect(() => {
    if (!mapRef.current) return;
    const [lat, lng] = center;
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      mapRef.current.setView([lat, lng], zoom, { animate: false });
    }
  }, [center, zoom]);

  // Init map once — always start at Olsen (hardcoded safe center)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { center: [CENTER_LAT, CENTER_LNG], zoom, zoomControl: true });
    L.tileLayer(SAT_URL, { attribution: '', maxZoom: 20 }).addTo(map);
    const fieldsPane = map.createPane(FIELDS_PANE);
    fieldsPane.style.zIndex = '399';
    mapRef.current = map;

    const groups = {
      fields: L.layerGroup().addTo(map),
      probes: L.layerGroup().addTo(map),
      plantDays: L.layerGroup(),
      repairs: L.layerGroup(),
      customers: L.layerGroup(),
      territory: L.layerGroup(),
    };
    layerGroupsRef.current = groups;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild fields layer
  useEffect(() => {
    const g = layerGroupsRef.current?.fields;
    if (!g) return;
    g.clearLayers();
    if (boundaries.features.length) {
      L.geoJSON(boundaries as GeoJSON.GeoJsonObject, {
        pane: FIELDS_PANE,
        interactive: true,
        style: { color: '#f8fafc', weight: 2, fillColor: '#1F402A', fillOpacity: 0.22 },
        onEachFeature: (feature, layer) => {
          const raw = (feature.properties as { fieldId?: number } | null)?.fieldId ?? feature.id;
          const id = typeof raw === 'number' ? raw : Number(raw);
          const field = fields.find(item => item.id === id);
          if (field) layer.bindPopup(fieldPopupHtml(field));
        },
      }).addTo(g);
    }
    // Field lat/lng is the default probe placement point (used as fallback for
    // placement_lat/install_lat). These pins look like probe markers, so only
    // show them when the Probes layer is on.
    if (layers.probes) {
      for (const f of fields) {
        if (f.showPlacementPin === false) continue;
        const lat = Number(f.lat);
        const lng = Number(f.lng);
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
        const circle = L.circleMarker([lat, lng], {
          radius: 6,
          color: '#fff',
          weight: 1,
          fillColor: '#4a7a5b',
          fillOpacity: 0.9,
        });
        circle.bindPopup(fieldPopupHtml(f));
        g.addLayer(circle);
      }
    }
  }, [fields, boundaries, layers.probes]);

  // Rebuild probes layer
  useEffect(() => {
    const g = layerGroupsRef.current?.probes;
    if (!g) return;
    g.clearLayers();
    for (const p of probes) {
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: '#fff',
        weight: 1,
        fillColor: statusColor(p.status),
        fillOpacity: 0.9,
      });
      circle.bindPopup(`<b>${p.label}</b><br>${p.fieldName}<br>${p.operation}<br><i>${p.status}</i>`);
      g.addLayer(circle);
    }
  }, [probes]);

  // Rebuild plantDays layer — uninstalled probes colored by days since planting
  useEffect(() => {
    const g = layerGroupsRef.current?.plantDays;
    if (!g) return;
    g.clearLayers();
    for (const p of plantDaysProbes) {
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: '#fff',
        weight: 1.5,
        fillColor: probeDaysColor(p.plantingDate),
        fillOpacity: 0.95,
      });
      const days = daysSince(p.plantingDate);
      const daysStr = days !== null ? `${days} days since planting` : 'No plant date';
      circle.bindPopup(`<b>${p.label}</b><br>${p.fieldName}<br>${p.operation}<br><i>${daysStr}</i>`);
      g.addLayer(circle);
    }
  }, [plantDaysProbes]);

  // Rebuild repairs layer
  useEffect(() => {
    const g = layerGroupsRef.current?.repairs;
    if (!g) return;
    g.clearLayers();
    for (const r of repairs) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid #fff;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const marker = L.marker([r.lat, r.lng], { icon });
      marker.bindPopup(
        `<b>Repair</b><br>${r.fieldName}<br>${r.operation}${r.problem ? `<br><i>${r.problem}</i>` : ''}${r.repairedAt ? `<br>Fixed: ${r.repairedAt}` : ''}`
      );
      g.addLayer(marker);
    }
  }, [repairs]);

  // Rebuild customers layer
  useEffect(() => {
    const g = layerGroupsRef.current?.customers;
    if (!g) return;
    g.clearLayers();
    for (const op of operations) {
      const circle = L.circleMarker([op.lat, op.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#8b5cf6',
        fillOpacity: 0.85,
      });
      circle.bindPopup(`<b>${op.name}</b><br>${op.fieldCount} field(s)`);
      g.addLayer(circle);
    }
  }, [operations]);

  // Rebuild territory layer
  useEffect(() => {
    const g = layerGroupsRef.current?.territory;
    if (!g) return;
    g.clearLayers();

    for (const cell of cells) {
      const bounds = zoneBounds(cell.band, cell.col);
      const rect = L.rectangle(bounds, {
        color: '#ffffff',
        weight: 2,
        opacity: 0.7,
        fillColor: '#4a7a5b',
        fillOpacity: 0.1,
        interactive: false,
      });

      const center = zoneCenter(cell.band, cell.col);
      const label = L.marker(center as [number, number], {
        icon: L.divIcon({
          className: '',
          html: `<div style="font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;text-align:center;">${cell.name}<br><span style="font-size:9px;font-weight:400;">${cell.fieldCount}f · ${cell.probeCount}p</span></div>`,
          iconSize: [64, 30],
          iconAnchor: [32, 15],
        }),
        interactive: false,
      });

      g.addLayer(rect);
      g.addLayer(label);
    }
  }, [cells]);

  // Toggle layer visibility
  useEffect(() => {
    const map = mapRef.current;
    const groups = layerGroupsRef.current;
    if (!map || !groups) return;

    const toggle = (group: L.LayerGroup, visible: boolean) => {
      if (visible && !map.hasLayer(group)) group.addTo(map);
      else if (!visible && map.hasLayer(group)) map.removeLayer(group);
    };

    toggle(groups.fields, layers.fields);
    toggle(groups.probes, layers.probes);
    toggle(groups.plantDays, layers.plantDays);
    toggle(groups.repairs, layers.repairs);
    toggle(groups.customers, layers.customers);
    toggle(groups.territory, layers.territory);
  }, [layers]);

  // Soils: detailed snapped-bbox tiles when zoomed in (z14+); simplified soil
  // families from 0.1° tiles when zoomed out (z11 to z13, about 10 to 30 miles).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setStatus = (status: SoilsViewStatus) => soilsStatusRef.current?.(status);
    const setFamilies = (rows: SoilFamilyLegendRow[]) => soilFamiliesRef.current?.(rows);
    let wide: WideSoilsDrawing | null = null;
    let wideKeys = '';
    const clearSoils = () => {
      soilsGroupRef.current?.remove();
      soilsGroupRef.current = null;
      wide = null;
      wideKeys = '';
    };

    if (!layers.soils) {
      clearSoils();
      setStatus('off');
      setFamilies([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let gen = 0;

    const run = () => {
      const my = ++gen;
      const zoomLevel = map.getZoom();
      const bounds = map.getBounds();
      const view = { w: bounds.getWest(), s: bounds.getSouth(), e: bounds.getEast(), n: bounds.getNorth() };
      const keys = zoomLevel >= SOILS_MIN_ZOOM ? soilBboxKeysForView(view, SOILS_MAX_TILES) : null;
      if (keys) {
        // Keep the last tiles on screen while a pan/zoom request is in flight.
        if (!cancelled && (!soilsGroupRef.current || wide)) setStatus('loading');
        Promise.all(keys.map(loadSoilMap))
          .then((maps) => {
            if (cancelled || my !== gen) return;
            const next = drawStaffSoils(map, maps);
            soilsGroupRef.current?.remove();
            soilsGroupRef.current = next;
            wide = null;
            wideKeys = '';
            setStatus('ready');
            setFamilies([]);
          })
          .catch(() => {
            if (cancelled || my !== gen) return;
            setStatus('error');
          });
        return;
      }
      const tiles = zoomLevel >= WIDE_MIN_ZOOM ? wideTileKeysForView(view, WIDE_MAX_TILES) : null;
      if (!tiles) {
        clearSoils();
        if (!cancelled) { setStatus('zoom'); setFamilies([]); }
        return;
      }
      const tileSet = tiles.join(';');
      if (wide && tileSet === wideKeys) return; // same tiles already drawn
      if (!cancelled && !wide) setStatus('loading');
      Promise.all(tiles.map(loadWideSoilMap))
        .then((maps) => {
          if (cancelled || my !== gen) return;
          const next = drawWideSoils(map, maps);
          soilsGroupRef.current?.remove();
          soilsGroupRef.current = next.group;
          wide = next;
          wideKeys = tileSet;
          setStatus('wide');
          setFamilies(next.families.slice(0, 8).map(({ name, color }) => ({ name, color })));
        })
        .catch(() => {
          if (cancelled || my !== gen) return;
          setStatus('error');
        });
    };

    // Zoomed out the soil fills are display only; a tap on open ground (not a
    // field, probe or other marker) shows the soil family at that spot.
    // If a soil popup is already open, this tap only closes it (the X does
    // too); the next tap can open one again. We skip the reopen that would
    // otherwise happen on click after Leaflet or our pointerdown closes it.
    const onClick = (event: L.LeafletMouseEvent) => {
      const dismiss = consumeSoilTapDismiss(map);
      if (!wide) return;
      const target = event.originalEvent?.target as Element | null;
      if (target?.closest?.('.leaflet-interactive, .leaflet-popup, .leaflet-control')) return;
      if (dismiss) {
        closeOpenSoilPopup(map);
        return;
      }
      const unit = wide.unitAt(event.latlng);
      if (!unit) return;
      L.popup(SOIL_POPUP_OPTIONS)
        .setLatLng(event.latlng)
        .setContent(wideSoilPopupHtml(unit))
        .openOn(map);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, SOILS_DEBOUNCE_MS);
    };

    run();
    const detachDismiss = attachSoilTapDismiss(map);
    map.on('moveend', schedule);
    map.on('zoomend', schedule);
    map.on('click', onClick);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      map.off('moveend', schedule);
      map.off('zoomend', schedule);
      map.off('click', onClick);
      detachDismiss();
      clearSoils();
    };
  }, [layers.soils]);

  // Elevation: viewport-stretched USGS 3DEP tiles in a pane below soils and markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mode = elevationMode === 'shade' ? 'shade' : elevationMode === 'color' ? 'color' : 'colorshade';
    if (elevationMode === 'off') {
      elevCtlRef.current?.detach();
      elevCtlRef.current = null;
      return;
    }
    const color = elevColor ?? {};
    const opacity = elevOpacityRef.current ?? DEFAULT_ELEV_OPACITY;
    if (!elevCtlRef.current) {
      elevCtlRef.current = attachStaffElevation(map, mode, (range) => elevRangeRef.current?.(range), color, opacity);
    } else {
      elevCtlRef.current.setMode(mode);
      elevCtlRef.current.setColorOptions(color);
    }
  }, [elevationMode, elevColor]);

  // Opacity is applied live on the existing tiles. Keep it out of the color
  // options so a slider drag does not rerender or reload the DEM.
  useEffect(() => {
    elevCtlRef.current?.setOpacity(elevOpacity ?? DEFAULT_ELEV_OPACITY);
  }, [elevOpacity]);

  // Low spots: ponds and flow paths computed on demand from the 3DEP DEM for the view.
  const lowSpotsStatusRef = useRef(onLowSpotsStatus);
  lowSpotsStatusRef.current = onLowSpotsStatus;
  const lowSpotsRef = useRef<StaffLowSpotsHandle | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!layers.lowSpots) {
      lowSpotsRef.current?.detach();
      lowSpotsRef.current = null;
      lowSpotsStatusRef.current?.('off');
      return;
    }
    if (lowSpotsRef.current) return;
    lowSpotsRef.current = attachStaffLowSpots(map, (status) => lowSpotsStatusRef.current?.(status));
  }, [layers.lowSpots]);

  // Canals: same static NHD/OSM lines as the field maps, view only.
  const canalsRef = useRef<StaffCanalsHandle | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!layers.canals) {
      canalsRef.current?.detach();
      canalsRef.current = null;
      return;
    }
    if (canalsRef.current) return;
    canalsRef.current = attachStaffCanals(map);
  }, [layers.canals]);

  // Highways and town names stay readable on top of Elevation and Soils, at any opacity.
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const needed = elevationMode !== 'off' || !!layers.soils || !!layers.lowSpots;
    if (!needed) {
      if (labelsLayerRef.current) {
        map.removeLayer(labelsLayerRef.current);
        labelsLayerRef.current = null;
      }
      return;
    }
    if (labelsLayerRef.current) return;
    let pane = map.getPane(LABELS_PANE);
    if (!pane) {
      pane = map.createPane(LABELS_PANE);
      pane.style.zIndex = '395';
    }
    pane.style.pointerEvents = 'none';
    labelsLayerRef.current = L.tileLayer(LABELS_URL, { attribution: '', maxZoom: 20, pane: LABELS_PANE }).addTo(map);
  }, [elevationMode, layers.soils, layers.lowSpots]);

  useEffect(() => {
    return () => {
      canalsRef.current?.detach();
      canalsRef.current = null;
      lowSpotsRef.current?.detach();
      lowSpotsRef.current = null;
      elevCtlRef.current?.detach();
      elevCtlRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
