export function getProductById(products = [], productId) {
  return products.find(product => product.id === productId) || null
}

export function getProductBySlug(products = [], slug) {
  return products.find(product => product.slug === slug) || null
}

export function getFeaturedProducts(products = []) {
  return products.filter(product => product.featured && product.visibility !== 'hidden')
}

export function getProductsByCategory(products = [], category) {
  return products.filter(product => product.category === category && product.visibility !== 'hidden')
}

export function getLatestProducts(products = [], limit = 8) {
  return [...products]
    .filter(product => product.visibility !== 'hidden')
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, Math.max(0, limit))
}
