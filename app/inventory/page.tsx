import { getInventory } from '@/lib/baserow';
import InventoryClient from './InventoryClient';

export interface ProcessedInventoryItem {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
}

export default async function InventoryPage() {
  let items: ProcessedInventoryItem[] = [];
  let categoryOptions: string[] = [];

  try {
    const inventory = await getInventory();

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
        <InventoryClient initialItems={items} categoryOptions={categoryOptions} />
      </div>
    </>
  );
}
