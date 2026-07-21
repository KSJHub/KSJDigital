import assert from 'node:assert/strict'
import { createProduct } from '../src/core/products/ProductFactory.js'
import { getFeaturedProducts, getLatestProducts, getProductById } from '../src/core/products/ProductQueries.js'
import { validateProduct } from '../src/core/products/ProductValidator.js'
import { normaliseMerchStore } from '../src/core/products/MerchStoreNormalizer.js'
import { getProductWarnings } from '../src/core/products/ProductWarnings.js'
import {
  createMerchProduct,
  duplicateMerchProduct,
  reorderMerchProducts,
  updateMerchProduct,
} from '../src/core/products/ProductService.js'
import { createStockRecord } from '../src/core/stock/StockRecord.js'
import { generateVariants } from '../src/core/stock/VariantGenerator.js'

const product = createProduct({
  id: 'product-test',
  name: 'Test Hoodie',
  priceGBP: 30,
  featured: true,
  status: 'active',
})

assert.equal(validateProduct(product).valid, true)
assert.equal(getProductById([product], product.id), product)
assert.deepEqual(getFeaturedProducts([product]), [product])
assert.deepEqual(getLatestProducts([product], 1), [product])

const merchProduct = createMerchProduct({
  id: 'merch-test',
  name: 'Merch Hoodie',
  priceGBP: 35,
  variants: { sizes: ['S', 'M'] },
  inventory: { trackStock: true, quantity: 4 },
})
assert.deepEqual(merchProduct.variants.sizes, ['S', 'M'])
assert.equal(merchProduct.inventory.quantity, 4)

const updated = updateMerchProduct([merchProduct], merchProduct.id, {
  inventory: { quantity: 7 },
})
assert.equal(updated[0].inventory.quantity, 7)
assert.equal(updated[0].inventory.trackStock, true)

const duplicated = duplicateMerchProduct(updated, merchProduct.id)
assert.equal(duplicated.products.length, 2)
assert.notEqual(duplicated.product.id, merchProduct.id)

const reordered = reorderMerchProducts(duplicated.products, duplicated.product.id, merchProduct.id)
assert.equal(reordered[0].id, duplicated.product.id)

const store = normaliseMerchStore({ merch: { products: [merchProduct] } }, 'Test Store')
assert.equal(store.title, 'Test Store Merch')
assert.equal(store.products.length, 1)
assert.ok(getProductWarnings(merchProduct, {}).includes('Add a description'))

const stock = createStockRecord({ productId: product.id, quantity: 5, trackStock: true })
assert.equal(stock.productId, product.id)
assert.equal(stock.quantity, 5)

const variants = generateVariants([
  { name: 'Colour', values: ['Black', 'Blue'] },
  { name: 'Size', values: ['S', 'M'] },
])
assert.equal(variants.length, 4)
assert.deepEqual(variants[0].options, { Colour: 'Black', Size: 'S' })

console.log('Commerce foundation checks passed')
