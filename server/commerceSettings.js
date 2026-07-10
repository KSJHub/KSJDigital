import { paths, readJson, safeName, writeJson } from './storage.js'

const DEFAULTS = {
  stripeEnabled: false,
  paypalEnabled: false,
  successUrl: '',
  cancelUrl: '',
  paypalReturnUrl: '',
  orderEmail: '',
  supportEmail: '',
  replyTo: '',
  discordWebhookUrl: '',
  deliveryMessage: 'Delivery and dispatch details will be confirmed separately.',
  returnsMessage: '',
}

function clean(value = '') {
  return typeof value === 'string' ? value.trim() : value
}

function validateHttpsUrl(value, label, { required = false } = {}) {
  if (!value && !required) return null
  if (!value && required) return `${label} is required`
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? null : `${label} must use HTTPS`
  } catch {
    return `${label} is invalid`
  }
}

export function sanitiseCommerceSettings(input = {}) {
  return {
    ...DEFAULTS,
    stripeEnabled: input.stripeEnabled === true,
    paypalEnabled: input.paypalEnabled === true,
    successUrl: clean(input.successUrl),
    cancelUrl: clean(input.cancelUrl),
    paypalReturnUrl: clean(input.paypalReturnUrl),
    orderEmail: clean(input.orderEmail).toLowerCase(),
    supportEmail: clean(input.supportEmail).toLowerCase(),
    replyTo: clean(input.replyTo).toLowerCase(),
    discordWebhookUrl: clean(input.discordWebhookUrl),
    deliveryMessage: clean(input.deliveryMessage) || DEFAULTS.deliveryMessage,
    returnsMessage: clean(input.returnsMessage),
  }
}

export function validateCommerceSettings(settings) {
  const errors = []
  if (settings.stripeEnabled) {
    errors.push(validateHttpsUrl(settings.successUrl, 'Stripe success URL', { required: true }))
    errors.push(validateHttpsUrl(settings.cancelUrl, 'Checkout cancel URL', { required: true }))
  }
  if (settings.paypalEnabled) {
    errors.push(validateHttpsUrl(settings.paypalReturnUrl, 'PayPal return URL', { required: true }))
    errors.push(validateHttpsUrl(settings.cancelUrl, 'Checkout cancel URL', { required: true }))
  }
  if (settings.discordWebhookUrl) {
    const error = validateHttpsUrl(settings.discordWebhookUrl, 'Discord webhook URL')
    if (error) errors.push(error)
    else {
      const host = new URL(settings.discordWebhookUrl).hostname
      if (!host.endsWith('discord.com') && !host.endsWith('discordapp.com')) {
        errors.push('Discord webhook must use an official Discord domain')
      }
    }
  }
  if ((settings.stripeEnabled || settings.paypalEnabled) && !settings.orderEmail) {
    errors.push('Order notification email is required')
  }
  return errors.filter(Boolean)
}

export async function getCommerceSettings(websiteId) {
  const stored = await readJson(paths.commerceSettings(safeName(websiteId)), null)
  return sanitiseCommerceSettings(stored || {})
}

export async function saveCommerceSettings(websiteId, input) {
  const settings = sanitiseCommerceSettings(input)
  const errors = validateCommerceSettings(settings)
  if (errors.length) {
    const error = new Error(errors.join('; '))
    error.code = 'INVALID_COMMERCE_SETTINGS'
    throw error
  }
  await writeJson(paths.commerceSettings(safeName(websiteId)), settings)
  return settings
}
