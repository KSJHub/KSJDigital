export function createStockRecord(input = {}) {
  if (!input.productId) throw new Error('Stock record requires a productId')

  return {
    productId: input.productId,
    sku: input.sku || '',
    trackStock: input.trackStock === true,
    quantity: Math.max(0, Number(input.quantity || 0)),
    lowStockThreshold: Math.max(0, Number(input.lowStockThreshold ?? 2)),
    madeToOrder: input.madeToOrder === true,
    leadTimeMessage: input.leadTimeMessage || '',
    supplier: input.supplier || '',
    costPriceGBP: input.costPriceGBP == null ? null : Math.max(0, Number(input.costPriceGBP)),
    barcode: input.barcode || '',
    weightGrams: Math.max(0, Number(input.weightGrams || 0)),
    updatedAt: new Date().toISOString(),
  }
}
