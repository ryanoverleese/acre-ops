import { getWeatherStations, getBillingEntities, getTableFieldOptions } from '@/lib/baserow';
import WeatherStationsClient from './WeatherStationsClient';

export const dynamic = 'force-dynamic';

export interface ProcessedWeatherStation {
  id: number;
  model: string;
  billingEntityId: number | null;
  billingEntityName: string;
  installLat: number | null;
  installLng: number | null;
  installDate: string;
  connectivityType: string;
  status: string;
  pricePaid: number;
  notes: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
}

export default async function WeatherStationsPage() {
  try {
    const [rawStations, billingEntities, wsOptions] = await Promise.all([
      getWeatherStations(),
      getBillingEntities(),
      getTableFieldOptions('weather_stations'),
    ]);

    const beMap = new Map(billingEntities.map(be => [be.id, be.name || 'Unknown']));

    const stations: ProcessedWeatherStation[] = rawStations.map(ws => {
      const beId = ws.billing_entity?.[0]?.id || null;
      return {
        id: ws.id,
        model: ws.model?.value || '',
        billingEntityId: beId,
        billingEntityName: beId ? (beMap.get(beId) || ws.billing_entity?.[0]?.value || 'Unknown') : '',
        installLat: ws.install_lat || null,
        installLng: ws.install_lng || null,
        installDate: ws.install_date || '',
        connectivityType: ws.connectivity_type?.value || '',
        status: ws.status?.value || '',
        pricePaid: ws.price_paid ? parseFloat(ws.price_paid) : 0,
        notes: ws.notes || '',
      };
    });

    const beOptions: BillingEntityOption[] = billingEntities
      .filter(be => be.name)
      .map(be => ({ id: be.id, name: be.name || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Extract select options for dropdowns
    const modelOptions = (wsOptions.model || []).map(o => o.value);
    const connectivityOptions = (wsOptions.connectivity_type || []).map(o => o.value);
    const statusOptions = (wsOptions.status || []).map(o => o.value);

    return (
      <WeatherStationsClient
        stations={stations}
        billingEntities={beOptions}
        modelOptions={modelOptions}
        connectivityOptions={connectivityOptions}
        statusOptions={statusOptions}
      />
    );
  } catch (error) {
    console.error('Error loading weather stations:', error);
    return (
      <WeatherStationsClient
        stations={[]}
        billingEntities={[]}
        modelOptions={['Davis Vantage Pro2']}
        connectivityOptions={['WiFi', 'Cellular', 'Other']}
        statusOptions={['Active', 'Offline', 'Decommissioned']}
      />
    );
  }
}
