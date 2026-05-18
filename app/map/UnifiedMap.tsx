'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { zoneBounds, zoneCenter, CENTER_LAT, CENTER_LNG } from '@/lib/territory-grid';
import type { LatBand } from '@/lib/territory-grid';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

export interface MapField {
  id: number;
  name: string;
  operation: string;
  lat: number;
  lng: number;
  acres?: number;
  crop?: string;
}

export interface MapProbe {
  id: number;
  label: string;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  status: string;
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

export interface Layers {
  fields: boolean;
  probes: boolean;
  repairs: boolean;
  customers: boolean;
  territory: boolean;
}

interface Props {
  fields: MapField[];
  probes: MapProbe[];
  repairs: MapRepair[];
  operations: MapOperation[];
  cells: MapCell[];
  layers: Layers;
  center: [number, number];
  zoom: number;
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

function probeStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('install') || s.includes('active')) return '#4a7a5b';
  if (s.includes('plan') || s.includes('pending')) return '#f59e0b';
  if (s.includes('remove')) return '#6b7280';
  if (s.includes('damage') || s.includes('repair')) return '#ef4444';
  return '#8b5cf6';
}

export default function UnifiedMap({ fields, probes, repairs, operations, cells, layers, center, zoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<{
    fields: L.LayerGroup;
    probes: L.LayerGroup;
    repairs: L.LayerGroup;
    customers: L.LayerGroup;
    territory: L.LayerGroup;
  } | null>(null);

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
    mapRef.current = map;

    const groups = {
      fields: L.layerGroup().addTo(map),
      probes: L.layerGroup().addTo(map),
      repairs: L.layerGroup().addTo(map),
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
    for (const f of fields) {
      const circle = L.circleMarker([f.lat, f.lng], {
        radius: 6,
        color: '#fff',
        weight: 1,
        fillColor: '#4a7a5b',
        fillOpacity: 0.9,
      });
      circle.bindPopup(
        `<b>${f.name}</b><br>${f.operation}${f.acres ? `<br>${f.acres} ac` : ''}${f.crop ? `<br>${f.crop}` : ''}`
      );
      g.addLayer(circle);
    }
  }, [fields]);

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
        fillColor: probeStatusColor(p.status),
        fillOpacity: 0.9,
      });
      circle.bindPopup(`<b>${p.label}</b><br>${p.fieldName}<br>${p.operation}<br><i>${p.status}</i>`);
      g.addLayer(circle);
    }
  }, [probes]);

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
    toggle(groups.repairs, layers.repairs);
    toggle(groups.customers, layers.customers);
    toggle(groups.territory, layers.territory);
  }, [layers]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
