import { unstable_cache } from 'next/cache';
import { getFieldsData } from '@/lib/fields-data';
import PlantingClient from './PlantingClient';

export const dynamic = 'force-dynamic';

export interface PlantingRow {
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  crop: string;
  plantingDate: string;
  plannedInstaller: string;
  routeOrder: number | null;
  gdu: number | null;
}

async function fetchGDURaw(lat: number, lng: number, plantingDate: string): Promise<number | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min&start_date=${plantingDate}&end_date=${today}&temperature_unit=fahrenheit&timezone=auto`;
    console.log('[GDU] fetching', { lat, lng, plantingDate, today, url });
    const res = await fetch(url);
    console.log('[GDU] response status', res.status, 'for', plantingDate);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.daily?.temperature_2m_max) { console.log('[GDU] no daily data for', plantingDate, data); return null; }
    let total = 0;
    for (let i = 0; i < data.daily.time.length; i++) {
      const tmax = Math.min(data.daily.temperature_2m_max[i] ?? 50, 86);
      const tmin = Math.max(data.daily.temperature_2m_min[i] ?? 50, 50);
      total += Math.max(0, (tmax + tmin) / 2 - 50);
    }
    return Math.round(total);
  } catch {
    return null;
  }
}

const fetchGDU = unstable_cache(
  fetchGDURaw,
  ['planting-gdu'],
  { revalidate: 86400 }
);

export default async function PlantingPage() {
  const currentYear = new Date().getFullYear();
  const { fields, selectOptions } = await getFieldsData(currentYear);

  // Only fields with a planting date this season
  const plantingFields = fields.filter((f) => f.fieldSeasonId && f.plantingDate);

  // Group by planting date → centroid lat/lng for GDU lookup
  const dateGroups = new Map<string, { latSum: number; lngSum: number; count: number }>();
  for (const f of plantingFields) {
    const g = dateGroups.get(f.plantingDate) ?? { latSum: 0, lngSum: 0, count: 0 };
    if (f.lat && f.lng) { g.latSum += f.lat; g.lngSum += f.lng; g.count++; }
    dateGroups.set(f.plantingDate, g);
  }

  // One GDU fetch per unique planting date, cached 24h
  const gduByDate = new Map<string, number | null>();
  const DEFAULT_LAT = 40.591112;
  const DEFAULT_LNG = -99.037735;

  console.log('[GDU] dateGroups:', Array.from(dateGroups.entries()).map(([d, g]) => ({ date: d, count: g.count })));

  await Promise.all(
    Array.from(dateGroups.entries()).map(async ([date, { latSum, lngSum, count }]) => {
      const lat = count > 0 ? latSum / count : DEFAULT_LAT;
      const lng = count > 0 ? lngSum / count : DEFAULT_LNG;
      const gdu = await fetchGDU(lat, lng, date);
      console.log('[GDU] result for', date, '->', gdu);
      gduByDate.set(date, gdu);
    })
  );

  const rows: PlantingRow[] = plantingFields.map((f) => ({
    fieldSeasonId: f.fieldSeasonId!,
    fieldName: f.name,
    operation: f.operation,
    crop: f.crop,
    plantingDate: f.plantingDate,
    plannedInstaller: f.plannedInstaller || '',
    routeOrder: f.routeOrder ?? null,
    gdu: gduByDate.get(f.plantingDate) ?? null,
  }));

  // Installer options: find the planned_installer select field options
  const fsOptions = selectOptions.field_seasons;
  const installerKey = Object.keys(fsOptions).find(
    (k) => k.toLowerCase().replace(/[\s_]/g, '').includes('plannedinstaller')
  );
  const installerOptions: string[] = installerKey
    ? (fsOptions[installerKey] as { id: number; value: string }[]).map((o) => o.value)
    : [];

  return <PlantingClient rows={rows} installerOptions={installerOptions} />;
}
