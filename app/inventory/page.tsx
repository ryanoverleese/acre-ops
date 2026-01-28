import InventoryClient from './InventoryClient';

// Note: If you have an inventory table in Baserow, update this to fetch from there
// For now, this uses local state since inventory table may not exist yet

export default async function InventoryPage() {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Inventory</h2>
        </div>
      </header>

      <div className="content">
        <InventoryClient />
      </div>
    </>
  );
}
