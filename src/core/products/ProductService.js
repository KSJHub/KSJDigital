import { normaliseMerchProduct, mergeMerchProduct } from './MerchProductAdapter.js'

export function createMerchProduct(input = {}) {
  return normaliseMerchProduct(input)
}

export function updateMerchProduct(products = [], productId, changes = {}) {
  return products.map(product => product.id === productId ? mergeMerchProduct(product, changes) : product)
}

export function duplicateMerchProduct(products = [], productId) {
  const source = products.find(product => product.id === productId)
  if (!source) return { products, product: null }

  const copy = normaliseMerchProduct({
    ...source,
    id: '',
    name: `${source.name} Copy`,
    createdAt: new Date().toISOString().slice(0, 10),
  })

  return { products: [...products, copy], product: copy }
}

export function removeMerchProduct(products = [], productId) {
  return products.filter(product => product.id !== productId)
}

export function reorderMerchProducts(products = [], sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return products

  const next = [...products]
  const from = next.findIndex(product => product.id === sourceId)
  const to = next.findIndex(product => product.id === targetId)
  if (from < 0 || to < 0) return products

  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
