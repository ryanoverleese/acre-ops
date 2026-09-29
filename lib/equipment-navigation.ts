export const EQUIPMENT_TABS = [
  { id: 'probes', label: 'Probes', href: '/equipment' },
  { id: 'racks', label: 'Racks', href: '/equipment/racks' },
  { id: 'supplies', label: 'Supplies', href: '/equipment/supplies' },
  { id: 'weather-stations', label: 'Weather Stations', href: '/equipment/weather-stations' },
] as const;

export const LEGACY_EQUIPMENT_ROUTES: Readonly<Record<string, string>> = {
  '/probes': '/equipment',
  '/racks': '/equipment/racks',
  '/inventory': '/equipment/supplies',
  '/weather-stations': '/equipment/weather-stations',
};

export function getEquipmentTab(pathname: string): typeof EQUIPMENT_TABS[number]['id'] {
  return EQUIPMENT_TABS.find(tab => tab.href !== '/equipment' &&
    (pathname === tab.href || pathname.startsWith(`${tab.href}/`)))?.id ?? 'probes';
}
