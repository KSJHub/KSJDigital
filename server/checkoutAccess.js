import { paths, readJson, safeName } from './storage.js'

export async function assertProductCheckoutAccess({ websiteId, productId, provider }) {
  const safeWebsiteId = safeName(websiteId)
  const content = await readJson(paths.content(safeWebsiteId), {})
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  const product = products.find(item => item.id === productId)

  if (!product) throw new Error('Product was not found')
  if (product.availability !== 'available') throw new Error('Product is not available')
  if (product.checkout?.enabled !== true) throw new Error('Checkout is disabled for this product')

  const configuredProvider = String(product.checkout?.provider || '').trim().toLowerCase()
  const requestedProvider = String(provider || '').trim().toLowerCase()
  if (configuredProvider !== requestedProvider) {
    throw new Error(`This product is configured for ${configuredProvider || 'a different payment provider'}`)
  }

  return { websiteId: safeWebsiteId, product }
}
