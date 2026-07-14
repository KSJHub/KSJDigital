import { getPublishedContent } from './publishedContent.js'
import { paths, readJson, safeName } from './storage.js'

function providerEnabled(settings, provider) {
  if (provider === 'stripe') return settings.stripeEnabled === true
  if (provider === 'paypal') return settings.paypalEnabled === true
  return false
}

export async function assertProductCheckoutAccess({ websiteId, productId, provider }) {
  const safeWebsiteId = safeName(websiteId)
  const requestedProvider = String(provider || '').trim().toLowerCase()
  if (!['stripe', 'paypal'].includes(requestedProvider)) {
    throw new Error('Unsupported checkout provider')
  }

  const [content, settings] = await Promise.all([
    getPublishedContent(safeWebsiteId),
    readJson(paths.commerceSettings(safeWebsiteId), {}),
  ])
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  const product = products.find(item => item.id === productId)

  if (!product) throw new Error('Product was not found')
  if (product.availability !== 'available') throw new Error('Product is not available')
  if (product.checkout?.enabled !== true) throw new Error('Checkout is disabled for this product')

  const checkoutMode = String(product.checkout?.mode || '').trim().toLowerCase()
  const legacyProvider = String(product.checkout?.provider || '').trim().toLowerCase()
  const managedCheckout = checkoutMode === 'managed' || (!checkoutMode && ['stripe', 'paypal'].includes(legacyProvider))

  if (!managedCheckout) throw new Error('This product uses an external checkout link')
  if (legacyProvider && !checkoutMode && legacyProvider !== requestedProvider) {
    throw new Error(`This product is configured for ${legacyProvider}`)
  }
  if (!providerEnabled(settings, requestedProvider)) {
    throw new Error(`${requestedProvider === 'stripe' ? 'Stripe' : 'PayPal'} is not enabled for this website`)
  }

  return { websiteId: safeWebsiteId, product }
}
