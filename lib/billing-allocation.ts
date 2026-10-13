/** Split the whole field charge in cents. Stable entity-ID ordering gives any
 * indivisible penny to the same entity on retry. Allocated rows have quantity 1:
 * their rate is their share of the total, not a rounded fractional unit price.
 */
export function equalShareAmount(total: number, count: number, index: number) {
  const cents = Math.round((total + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count)
    throw new Error('Invalid equal-share amount');
  return (Math.floor(cents / count) + (index < cents % count ? 1 : 0)) / 100;
}

export type SavedFieldCharge = { rate: number; quantity: number; field_unit_rate?: number | null; field_quantity?: number | null };
export function fieldChargeBasis(lines: SavedFieldCharge[], catalogRate: number) {
  if (!lines.length) return {fieldUnitRate: catalogRate, fieldQuantity: 1};
  const first = lines[0];
  if (lines.every(line => line.field_unit_rate != null && line.field_quantity != null &&
      line.field_unit_rate === first.field_unit_rate && line.field_quantity === first.field_quantity))
    return {fieldUnitRate: first.field_unit_rate!, fieldQuantity: first.field_quantity!};
  // A single legacy unsplit charge retains its original unit rate and quantity.
  if (lines.length === 1 && first.field_unit_rate == null && first.field_quantity == null)
    return {fieldUnitRate: first.rate, fieldQuantity: first.quantity};
  // An old shared total cannot tell us its original unit rate. Never invent one.
  return {fieldUnitRate: null, fieldQuantity: null};
}

export function quantityEditBasis(line: {fieldUnitRate: number | null}, quantity: number) {
  if (line.fieldUnitRate == null) throw new Error('The original field rate is missing. Set the billing rate in Edit Season before changing quantity.');
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Quantity must be a non-negative number');
  return {rate: line.fieldUnitRate, quantity};
}

export function allocateFieldCharge(rate: number, quantity: number, entityIds: number[]) {
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(quantity) || quantity < 0)
    throw new Error('Rate and quantity must be non-negative numbers');
  const ids = [...new Set(entityIds)].sort((a, b) => a - b);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0))
    throw new Error('The field needs at least one billing entity');
  const cents = Math.round((rate * quantity + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents > 99999999999999)
    throw new Error('The field charge is too large');
  return ids.map((billingEntityId, index) => ({ billingEntityId,
    rate: ids.length === 1 ? rate : equalShareAmount(rate * quantity, ids.length, index),
    quantity: ids.length === 1 ? quantity : 1,
    shareCount: ids.length,
    shareIndex: index,
  }));
}
