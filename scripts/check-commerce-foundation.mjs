import assert from 'node:assert/strict'
import { createProduct } from '../src/core/products/ProductFactory.js'
import { getFeaturedProducts, getLatestProducts, getProductById } from '../src/core/products/ProductQueries.js'
import { validateProduct } from '../src/core/products/ProductValidator.js'
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
