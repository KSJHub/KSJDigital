export function getProductWarnings(product, commerce = {}) {
  if (!product) return []

  const warnings = []
  if (!product.name?.trim()) warnings.push('Add a product name')
  if (!product.description?.trim()) warnings.push('Add a description')
  if (Number(product.priceGBP) <= 0) warnings.push('Add a price')
  if (!product.image?.url?.trim()) warnings.push('Add a product image')
  if (product.fulfilmentOptions?.madeToOrder && !product.fulfilmentOptions.leadTimeMessage?.trim()) {
    warnings.push('Add a production timeframe')
  }
  if (product.checkout?.mode === 'external' && product.checkout.enabled && !/^https:\/\//i.test(product.checkout.url || '')) {
    warnings.push('Add a secure external checkout URL')
  }
  if (product.checkout?.mode === 'managed' && product.checkout.enabled && !commerce.stripeEnabled && !commerce.paypalEnabled) {
    warnings.push('Enable Stripe or PayPal in Store Settings')
  }
  if (product.inventory?.trackStock && !product.fulfilmentOptions?.madeToOrder && product.inventory.quantity <= 0) {
    warnings.push('Product has no ready stock')
  }

  return warnings
}
