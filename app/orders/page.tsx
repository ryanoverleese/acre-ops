import { getOrders, getOrderItems, getBillingEntities, getProductsServices, getTableFieldOptions } from '@/lib/baserow';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export interface ProcessedOrder {
  id: number;
  billingEntityId: number | null;
  billingEntityName: string;
  orderDate: string;
  status: string;
  notes: string;
  quoteValidDays: number;
  items: ProcessedOrderItem[];
  total: number;
}

export interface ProcessedOrderItem {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
}

export interface CatalogProduct {
  id: number;
  name: string;
  category: string;
  rate: number;
  unit: string;
  active: boolean;
}

export interface BillingEntityOption {
  id: number;
  name: string;
}

export default async function OrdersPage() {
  try {
    const [rawOrders, rawItems, billingEntities, rawProducts, orderOptions] = await Promise.all([
      getOrders(),
      getOrderItems(),
      getBillingEntities(),
      getProductsServices(),
      getTableFieldOptions('orders'),
    ]);

    const beMap = new Map(billingEntities.map(be => [be.id, be.name || 'Unknown']));

    // Build catalog
    const catalog: CatalogProduct[] = rawProducts
      .filter(p => !p.status || p.status?.value === 'Active')
      .map(p => ({
        id: p.id,
        name: p.service_type || '',
        category: p.category?.value || '',
        rate: p.rate || 0,
        unit: p.unit?.value || 'each',
        active: !p.status || p.status?.value === 'Active',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Process items grouped by order
    const itemsByOrder = new Map<number, ProcessedOrderItem[]>();
    for (const item of rawItems) {
      const orderId = item.order?.[0]?.id;
      if (!orderId) continue;

      const productId = item.product?.[0]?.id || null;
      const productName = item.product?.[0]?.value || '';

      const processed: ProcessedOrderItem = {
        id: item.id,
        orderId,
        productId,
        productName,
        quantity: item.quantity || 0,
        unitPrice: item.unit_price ? parseFloat(item.unit_price) : 0,
        lineTotal: item.line_total ? parseFloat(item.line_total) : 0,
        notes: item.notes || '',
      };

      if (!itemsByOrder.has(orderId)) {
        itemsByOrder.set(orderId, []);
      }
      itemsByOrder.get(orderId)!.push(processed);
    }

    // Process orders
    const orders: ProcessedOrder[] = rawOrders.map(o => {
      const beId = o.billing_entity?.[0]?.id || null;
      const items = itemsByOrder.get(o.id) || [];
      const total = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

      return {
        id: o.id,
        billingEntityId: beId,
        billingEntityName: beId ? (beMap.get(beId) || o.billing_entity?.[0]?.value || 'Unknown') : '',
        orderDate: o.order_date || '',
        status: o.status?.value || 'Quote',
        notes: o.notes || '',
        quoteValidDays: o.quote_valid_days || 30,
        items,
        total,
      };
    });

    const beOptions: BillingEntityOption[] = billingEntities
      .filter(be => be.name)
      .map(be => ({ id: be.id, name: be.name || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const statusOptions = (orderOptions.status || []).map(o => o.value);

    return (
      <OrdersClient
        orders={orders}
        billingEntities={beOptions}
        catalog={catalog}
        statusOptions={statusOptions.length > 0 ? statusOptions : ['Quote', 'Ordered', 'Shipped', 'Received', 'Fulfilled']}
      />
    );
  } catch (error) {
    console.error('Error loading orders:', error);
    return (
      <OrdersClient
        orders={[]}
        billingEntities={[]}
        catalog={[]}
        statusOptions={['Quote', 'Ordered', 'Shipped', 'Received', 'Fulfilled']}
      />
    );
  }
}
