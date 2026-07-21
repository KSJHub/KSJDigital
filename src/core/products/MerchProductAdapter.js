import { createProduct } from './ProductFactory.js'

function list(value) {
  return Array.isArray(value) ? value : []
}

export function normaliseMerchProduct(input = {}) {
  const product = createProduct(input)
  const external = input.checkout?.mode === 'external'
    || (input.checkout?.provider && !['stripe', 'paypal'].includes(String(input.checkout.provider).toLowerCase()))

  return {
    ...product,
    availability: input.availability || 'prelaunch',
    status: input.status || 'Coming Soon',
    orderTag: input.orderTag || '',
    shippingNote: input.shippingNote || '',
    internalNotes: input.internalNotes || '',
    variants: {
      sizes: list(input.variants?.sizes),
      colours: list(input.variants?.colours),
    },
    inventory: {
      trackStock: input.inventory?.trackStock === true,
      quantity: Math.max(0, Number(input.inventory?.quantity || 0)),
      lowStockThreshold: Math.max(0, Number(input.inventory?.lowStockThreshold ?? 2)),
    },
    fulfilmentOptions: {
      madeToOrder: input.fulfilmentOptions?.madeToOrder === true,
      leadTimeMessage: input.fulfilmentOptions?.leadTimeMessage || '',
    },
    checkout: {
      enabled: input.checkout?.enabled === true,
      mode: external ? 'external' : 'managed',
      provider: external ? 'Custom' : '',
      url: input.checkout?.url || '',
      label: input.checkout?.label || 'Buy Now',
    },
  }
}

export function mergeMerchProduct(product, changes = {}) {
  return normaliseMerchProduct({
    ...product,
    ...changes,
    image: changes.image ? { ...product.image, ...changes.image } : product.image,
    checkout: changes.checkout ? { ...product.checkout, ...changes.checkout } : product.checkout,
    variants: changes.variants ? { ...product.variants, ...changes.variants } : product.variants,
    inventory: changes.inventory ? { ...product.inventory, ...changes.inventory } : product.inventory,
    fulfilmentOptions: changes.fulfilmentOptions
      ? { ...product.fulfilmentOptions, ...changes.fulfilmentOptions }
      : product.fulfilmentOptions,
  })
}
