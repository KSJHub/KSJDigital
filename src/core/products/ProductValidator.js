const VALID_STATUSES = new Set(['draft', 'active', 'hidden', 'out-of-stock', 'pre-order', 'discontinued'])
const VALID_VISIBILITY = new Set(['visible', 'hidden'])

export function validateProduct(product = {}) {
  const errors = []

  if (!product.id) errors.push('Product id is required')
  if (!product.name?.trim()) errors.push('Product name is required')
  if (Number(product.priceGBP) < 0) errors.push('Product price cannot be negative')
  if (product.salePriceGBP != null && Number(product.salePriceGBP) < 0) errors.push('Sale price cannot be negative')
  if (product.salePriceGBP != null && Number(product.salePriceGBP) > Number(product.priceGBP)) errors.push('Sale price cannot exceed the standard price')
  if (!VALID_STATUSES.has(product.status)) errors.push(`Unsupported product status: ${product.status}`)
  if (!VALID_VISIBILITY.has(product.visibility)) errors.push(`Unsupported product visibility: ${product.visibility}`)

  return {
    valid: errors.length === 0,
    errors,
  }
}
