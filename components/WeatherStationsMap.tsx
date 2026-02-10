'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as esriLeaflet from 'esri-leaflet';

interface StationMapData {
  id: number;
  name: string;
  model: string;
  status: string;
  lat: number;
  lng: number;
}

interface WeatherStationsMapProps {
  stations: StationMapData[];
  onClose?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Active: '#34d399',
  Offline: '#fbbf24',
  Decommissioned: '#6b7280',
  default: '#60a5fa',
};

export default function WeatherStationsMap({ stations, onClose }: WeatherStationsMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const plssLayerRef = useRef<ReturnType<typeof esriLeaflet.dynamicMapLayer> | null>(null);
  const [showPLSS, setShowPLSS] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [39.5, -98.35],
      zoom: 5,
      zoomControl: true,
    });
    mapRef.current = map;

    // Satellite tiles
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '',
    }).addTo(map);

    // Add station markers
    const markers: L.CircleMarker[] = [];
    stations.forEach(station => {
      if (!station.lat || !station.lng) return;

      const color = STATUS_COLORS[station.status] || STATUS_COLORS.default;
      const marker = L.circleMarker([station.lat, station.lng], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: system-ui; min-width: 150px;">
          <strong style="font-size: 14px;">${station.name}</strong><br/>
          <span style="color: #666; font-size: 12px;">${station.model}</span><br/>
          <span style="display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 8px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color};">${station.status}</span>
        </div>
      `);

      markers.push(marker);
    });

    // Fit bounds if we have stations
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [stations]);

  // Toggle PLSS grid overlay
  useEffect(() => {
    if (!mapRef.current) return;
    if (showPLSS && !plssLayerRef.current) {
      plssLayerRef.current = esriLeaflet.dynamicMapLayer({
        url: 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer',
        layers: [1, 2],
        opacity: 0.5,
      });
      plssLayerRef.current.addTo(mapRef.current);
    } else if (!showPLSS && plssLayerRef.current) {
      mapRef.current.removeLayer(plssLayerRef.current);
      plssLayerRef.current = null;
    }
  }, [showPLSS]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapContainerRef} style={{ height: '500px', width: '100%' }} />

      {/* Station count badge */}
      <div style={{
        position: 'absolute', top: '10px', left: '10px', zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px',
        borderRadius: '20px', fontSize: '13px', fontWeight: 600,
      }}>
        {stations.length} station{stations.length !== 1 ? 's' : ''}
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 12px',
        borderRadius: 'var(--radius)', fontSize: '11px',
      }}>
        {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'default').map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
            {status}
          </div>
        ))}
      </div>

      {/* PLSS toggle */}
      <label style={{
        position: 'absolute', top: '10px', right: onClose ? '52px' : '10px', zIndex: 1000,
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px',
        borderRadius: '20px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={showPLSS}
          onChange={(e) => setShowPLSS(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        PLSS Grid
      </label>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '10px', right: '10px', zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none',
            borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
