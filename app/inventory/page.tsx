import { getInventory, getFieldSeasons, getProbeAssignments } from '@/lib/baserow';

// Force dynamic rendering to always get fresh data
export const dynamic = 'force-dynamic';
import InventoryClient from './InventoryClient';

export interface ProcessedInventoryItem {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
}

export interface EquipmentCount {
  type: string;
  count: number;
}

export default async function InventoryPage() {
  let items: ProcessedInventoryItem[] = [];
  let categoryOptions: string[] = [];
  let antennaNeeds: EquipmentCount[] = [];
  let batteryNeeds: EquipmentCount[] = [];
  let flagNeeds: EquipmentCount[] = [];
  let equipmentSeason = String(new Date().getFullYear());

  try {
    const [inventory, fieldSeasons, probeAssignments] = await Promise.all([
      getInventory(),
      getFieldSeasons(),
      getProbeAssignments(),
    ]);

    // Collect unique categories
    const categories = new Set<string>();

    items = inventory.map((item) => {
      const category = item.category?.value || 'Uncategorized';
      categories.add(category);

      return {
        id: item.id,
        itemName: item.item_name || '',
        category,
        quantity: item.quantity || 0,
      };
    });

    categoryOptions = Array.from(categories).sort();

    // Compute equipment needs from probe_assignments for current season
    // All probes (1, 2, etc.) are stored in probe_assignments
    const currentYear = String(new Date().getFullYear());
    const antennaCounts = new Map<string, number>();
    const batteryCounts = new Map<string, number>();

    // Build a set of current-year field_season IDs for filtering probe_assignments
    const currentYearFsIds = new Set<number>();
    fieldSeasons.forEach((fs) => {
      if (String(fs.season) === currentYear) {
        currentYearFsIds.add(fs.id);
      }
    });

    // All equipment from probe_assignments (only those linked to current year field_seasons)
    let stubAntennaCount = 0;
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId || !currentYearFsIds.has(fsId)) return;
      const antenna = pa.antenna_type?.value;
      const battery = pa.battery_type?.value;
      if (antenna) antennaCounts.set(antenna, (antennaCounts.get(antenna) || 0) + 1);
      if (battery) batteryCounts.set(battery, (batteryCounts.get(battery) || 0) + 1);
      if (antenna === 'CropX Stub' || antenna === 'Sentek Stub') stubAntennaCount++;
    });

    flagNeeds = stubAntennaCount > 0
      ? [{ type: "4' White Flag", count: stubAntennaCount }]
      : [];

    antennaNeeds = Array.from(antennaCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    batteryNeeds = Array.from(batteryCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    equipmentSeason = currentYear;
  } catch (error) {
    console.error('Error fetching inventory data:', error);
  }

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Inventory</h2>
        </div>
      </header>

      <div className="content">
        <InventoryClient
          initialItems={items}
          categoryOptions={categoryOptions}
          antennaNeeds={antennaNeeds}
          batteryNeeds={batteryNeeds}
          flagNeeds={flagNeeds}
          equipmentSeason={equipmentSeason}
        />
      </div>
    </>
  );
}
