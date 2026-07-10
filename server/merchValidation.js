function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function validateProduct(product, index) {
  const label = text(product?.name) || `Product ${index + 1}`
  const errors = []

  if (!text(product?.name)) errors.push(`${label}: product name is required`)
  if (!text(product?.description)) errors.push(`${label}: description is required`)
  if (!Number.isFinite(Number(product?.priceGBP)) || Number(product.priceGBP) <= 0) {
    errors.push(`${label}: price must be greater than £0`)
  }
  if (!text(product?.image?.url)) errors.push(`${label}: product image is required`)
  if (!text(product?.shippingNote)) errors.push(`${label}: shipping or delivery note is required`)

  if (product?.checkout?.enabled === true) {
    if (product?.availability !== 'available') {
      errors.push(`${label}: checkout requires Available status`)
    }

    const provider = text(product?.checkout?.provider).toLowerCase()
    if (!provider) {
      errors.push(`${label}: checkout provider is required`)
    }

    if (!['stripe', 'paypal'].includes(provider)) {
      const checkoutUrl = text(product?.checkout?.url)
      if (!checkoutUrl) {
        errors.push(`${label}: checkout URL is required`)
      } else {
        try {
          const url = new URL(checkoutUrl)
          if (url.protocol !== 'https:') {
            errors.push(`${label}: checkout URL must use HTTPS`)
          }
        } catch {
          errors.push(`${label}: checkout URL is invalid`)
        }
      }
    }
  }

  return errors
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
