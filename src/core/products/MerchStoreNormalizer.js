import { normaliseMerchProduct } from './MerchProductAdapter.js'

export function normaliseMerchStore(content = {}, websiteName = 'Your Store') {
  return {
    title: content.merch?.title || `${websiteName} Merch`,
    eyebrow: content.merch?.eyebrow || 'Official Store',
    subtitle: content.merch?.subtitle || `Official products from ${websiteName}.`,
    products: (content.merch?.products || []).map(normaliseMerchProduct),
  }
}
