import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { GET, POST } = crudCollection({
  table: 'weather_stations',
  listAsArray: true,
  createStatus: 201,
  revalidate: '/weather-stations',
  mapCreate: (body) =>
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
