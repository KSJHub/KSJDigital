function normaliseOption(option = {}) {
  return {
    name: option.name?.trim() || '',
    values: [...new Set((option.values || []).map(value => String(value).trim()).filter(Boolean))],
  }
}

export function generateVariants(options = []) {
  const usable = options.map(normaliseOption).filter(option => option.name && option.values.length)
  if (!usable.length) return []

  return usable.reduce((variants, option) => {
    if (!variants.length) {
      return option.values.map(value => ({ options: { [option.name]: value } }))
    }

    return variants.flatMap(variant => option.values.map(value => ({
      options: { ...variant.options, [option.name]: value },
    })))
  }, [])
}
