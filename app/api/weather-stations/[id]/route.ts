import { crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'weather_stations',
  revalidate: '/weather-stations',
  mapUpdate: (body) =>
    pick(
      body,
      [
        'station_name',
        'model',
        'billing_entity',
        'install_lat',
        'install_lng',
        'install_date',
        'connectivity_type',
        'status',
        'price_paid',
        'notes',
      ],
      {
        links: ['billing_entity'],
        aliases: { station_name: 'station name' },
      },
    ),
});
