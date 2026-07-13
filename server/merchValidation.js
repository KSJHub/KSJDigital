import { paths, readJson, safeName, writeJson } from './storage.js'

const inventoryQueues = new Map()

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function isMadeToOrder(product = {}) {
  return product.fulfilmentOptions?.madeToOrder === true
}

function variantKey(size = '', colour = '') {
  return `${text(size).toLowerCase()}::${text(colour).toLowerCase()}`
}

function variantStock(product = {}) {
  return Array.isArray(product.inventory?.variants) ? product.inventory.variants : []
}

function findVariantStock(product, variant = {}) {
  const key = variantKey(variant.size, variant.colour)
  return variantStock(product).find(item => variantKey(item.size, item.colour) === key) || null
}

function totalTrackedStock(product = {}) {
  const records = variantStock(product)
  if (records.length) {
    return records.reduce((total, item) => total + Math.max(0, Number(item.quantity || 0)), 0)
  }
  return Math.max(0, Number(product.inventory?.quantity || 0))
}

function validateProduct(product, index) {
  const label = text(product?.name) || `Product ${index + 1}`
  const errors = []
  const records = variantStock(product)

  if (!text(product?.name)) errors.push(`${label}: product name is required`)
  if (!text(product?.description)) errors.push(`${label}: description is required`)
  if (!Number.isFinite(Number(product?.priceGBP)) || Number(product.priceGBP) <= 0) {
    errors.push(`${label}: price must be greater than £0`)
  }
  if (!text(product?.image?.url)) errors.push(`${label}: product image is required`)
  if (!text(product?.shippingNote)) errors.push(`${label}: shipping or delivery note is required`)
  if (isMadeToOrder(product) && !text(product.fulfilmentOptions?.leadTimeMessage)) {
    errors.push(`${label}: made-to-order timeframe message is required`)
  }
  if (product?.inventory?.trackStock && Number(product.inventory.quantity) < 0) {
    errors.push(`${label}: stock quantity cannot be negative`)
  }

  const seenVariants = new Set()
  records.forEach(record => {
    const key = variantKey(record.size, record.colour)
    if (seenVariants.has(key)) errors.push(`${label}: duplicate stock variant ${record.size || 'Standard'} / ${record.colour || 'Standard'}`)
    seenVariants.add(key)
    if (Number(record.quantity) < 0) errors.push(`${label}: variant stock cannot be negative`)
    if (Number(record.lowStockThreshold) < 0) errors.push(`${label}: variant low-stock warning cannot be negative`)
  })

  if (product?.checkout?.enabled === true) {
    if (product?.availability !== 'available') {
      errors.push(`${label}: checkout requires Available status`)
    }
    if (!isMadeToOrder(product) && product?.inventory?.trackStock && totalTrackedStock(product) <= 0) {
      errors.push(`${label}: checkout requires stock greater than zero`)
    }

    const provider = text(product?.checkout?.provider).toLowerCase()
    if (!provider) errors.push(`${label}: checkout provider is required`)

    if (!['stripe', 'paypal'].includes(provider)) {
      const checkoutUrl = text(product?.checkout?.url)
      if (!checkoutUrl) {
        errors.push(`${label}: checkout URL is required`)
      } else {
        try {
          const url = new URL(checkoutUrl)
          if (url.protocol !== 'https:') errors.push(`${label}: checkout URL must use HTTPS`)
        } catch {
          errors.push(`${label}: checkout URL is invalid`)
        }
      }
    }
  }

  return errors
}

export function resolveProductSelection(product, quantity = 1, variant = {}) {
  const safeQuantity = Math.max(1, Math.min(10, Number(quantity) || 1))
  const sizes = list(product?.variants?.sizes)
  const colours = list(product?.variants?.colours)
  const size = text(variant?.size)
  const colour = text(variant?.colour)

  if (sizes.length && !size) throw new Error('Please choose a size')
  if (sizes.length && !sizes.includes(size)) throw new Error('Selected size is unavailable')
  if (colours.length && !colour) throw new Error('Please choose a colour')
  if (colours.length && !colours.includes(colour)) throw new Error('Selected colour is unavailable')

  if (!isMadeToOrder(product) && product?.inventory?.trackStock) {
    const records = variantStock(product)
    if (records.length) {
      const selectedStock = findVariantStock(product, { size, colour })
      if (!selectedStock) throw new Error('Selected variant is unavailable')
      if (Number(selectedStock.quantity || 0) < safeQuantity) {
        throw new Error('Requested quantity is not available for this variant')
      }
    } else if (Number(product.inventory.quantity) < safeQuantity) {
      throw new Error('Requested quantity is not available')
    }
  }

  return {
    quantity: safeQuantity,
    variant: { size, colour },
    madeToOrder: isMadeToOrder(product),
    leadTimeMessage: text(product.fulfilmentOptions?.leadTimeMessage),
  }
}

function queueInventoryMutation(websiteId, action) {
  const key = safeName(websiteId)
  const previous = inventoryQueues.get(key) || Promise.resolve()
  const current = previous.catch(() => undefined).then(action)
  inventoryQueues.set(key, current)
  return current.finally(() => {
    if (inventoryQueues.get(key) === current) inventoryQueues.delete(key)
  })
}

function adjustedProduct(product, quantity, variant = {}, direction = -1) {
  if (!product.inventory?.trackStock || isMadeToOrder(product)) return product

  const safeQuantity = Math.max(1, Number(quantity || 1))
  const change = safeQuantity * direction
  const records = variantStock(product)
  let nextInventory

  if (records.length) {
    const selectedKey = variantKey(variant.size, variant.colour)
    const selected = records.find(record => variantKey(record.size, record.colour) === selectedKey)
    if (!selected) throw new Error(`Selected stock variant was not found for ${product.name}`)

    const available = Math.max(0, Number(selected.quantity || 0))
    if (direction < 0 && available < safeQuantity) {
      throw new Error(`${product.name} sold out before payment could be finalised`)
    }

    const nextVariants = records.map(record =>
      variantKey(record.size, record.colour) === selectedKey
        ? { ...record, quantity: Math.max(0, Number(record.quantity || 0) + change) }
        : record,
    )
    nextInventory = {
      ...product.inventory,
      variants: nextVariants,
      quantity: nextVariants.reduce((total, record) => total + Math.max(0, Number(record.quantity || 0)), 0),
    }
  } else {
    const available = Math.max(0, Number(product.inventory.quantity || 0))
    if (direction < 0 && available < safeQuantity) {
      throw new Error(`${product.name} sold out before payment could be finalised`)
    }
    nextInventory = {
      ...product.inventory,
      quantity: Math.max(0, available + change),
    }
  }

  const soldOut = Number(nextInventory.quantity || 0) <= 0
  const restored = direction > 0 && Number(nextInventory.quantity || 0) > 0
  return {
    ...product,
    inventory: nextInventory,
    availability: restored ? 'available' : soldOut ? 'sold-out' : product.availability,
    status: restored ? 'Available' : soldOut ? 'Sold Out' : product.status,
    checkout: restored
      ? { ...product.checkout, enabled: true }
      : soldOut
        ? { ...product.checkout, enabled: false }
        : product.checkout,
  }
}

async function adjustProductStock(websiteId, productId, quantity, variant = {}, direction = -1) {
  return queueInventoryMutation(websiteId, async () => {
    const safeWebsiteId = safeName(websiteId)
    const content = await readJson(paths.content(safeWebsiteId), {})
    const products = Array.isArray(content.merch?.products) ? content.merch.products : []
    const index = products.findIndex(item => item.id === productId)
    if (index < 0) throw new Error('Product was not found while updating stock')

    const nextProducts = [...products]
    nextProducts[index] = adjustedProduct(products[index], quantity, variant, direction)
    await writeJson(paths.content(safeWebsiteId), {
      ...content,
      merch: { ...content.merch, products: nextProducts },
    })
    return nextProducts[index].inventory || null
  })
}

export async function decrementBasketStock(websiteId, items = []) {
  return queueInventoryMutation(websiteId, async () => {
    const safeWebsiteId = safeName(websiteId)
    const content = await readJson(paths.content(safeWebsiteId), {})
    const products = Array.isArray(content.merch?.products) ? content.merch.products : []
    const nextProducts = [...products]

    for (const item of items) {
      const index = nextProducts.findIndex(product => product.id === item.productId)
      if (index < 0) throw new Error(`${item.name || 'A basket product'} was not found while updating stock`)
      nextProducts[index] = adjustedProduct(
        nextProducts[index],
        item.quantity,
        item.variant,
        -1,
      )
    }

    await writeJson(paths.content(safeWebsiteId), {
      ...content,
      merch: { ...content.merch, products: nextProducts },
    })
    return nextProducts
  })
}

export async function decrementProductStock(websiteId, productId, quantity, variant = {}) {
  return adjustProductStock(websiteId, productId, quantity, variant, -1)
}

export async function restoreProductStock(websiteId, productId, quantity, variant = {}) {
  return adjustProductStock(websiteId, productId, quantity, variant, 1)
}

export function validateMerchContent(content = {}) {
  const merch = content?.merch
  if (!merch) return []

  const errors = []
  if (!text(merch.title)) errors.push('Merch store title is required')
  if (!Array.isArray(merch.products)) return [...errors, 'Merch products must be an array']

  const ids = new Set()
  merch.products.forEach((product, index) => {
    const id = text(product?.id)
    if (!id) {
      errors.push(`Product ${index + 1}: product ID is required`)
    } else if (ids.has(id)) {
      errors.push(`${text(product?.name) || `Product ${index + 1}`}: duplicate product ID`)
    } else {
      ids.add(id)
    }

    errors.push(...validateProduct(product, index))
  })

  return errors
}
