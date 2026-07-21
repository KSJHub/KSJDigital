function createId() {
  return `product-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normaliseImage(image = {}, productName = 'Product image') {
  return {
    id: image.id || '',
    title: image.title || 'Product image',
    url: image.url || '',
    alt: image.alt || productName,
  }
}

export function createProduct(input = {}) {
  const now = new Date().toISOString()
  const name = input.name?.trim() || 'New Product'

  return {
    id: input.id || createId(),
    name,
    slug: input.slug || '',
    category: input.category || 'Apparel',
    type: input.type || 'Product',
    description: input.description || '',
    priceGBP: Math.max(0, Number(input.priceGBP || 0)),
    salePriceGBP: input.salePriceGBP == null ? null : Math.max(0, Number(input.salePriceGBP)),
    image: normaliseImage(input.image, name),
    featured: input.featured === true,
    limited: input.limited === true,
    showInCarousel: input.showInCarousel === true,
    visibility: input.visibility || 'visible',
    status: input.status || 'draft',
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
}
