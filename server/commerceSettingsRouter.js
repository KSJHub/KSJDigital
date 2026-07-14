import express from 'express'
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
  shippingEnabled: true,
  standardShippingLabel: 'UK Standard Delivery',
  standardShippingRate: 3.99,
  freeShippingEnabled: false,
  freeShippingThreshold: 50,
  estimatedDeliveryMinDays: 3,
  estimatedDeliveryMaxDays: 5,
  taxEnabled: false,
  taxLabel: 'VAT',
  taxRate: 20,
  pricesIncludeTax: true,
  taxShipping: true,
  taxNumber: '',
  discountCodes: [],
}

function clean(value = '') {
  return typeof value === 'string' ? value.trim() : value
}

function money(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : fallback
}

function wholeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}

export function normaliseDiscountCode(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24)
}

function sanitiseDiscountCodes(input = []) {
  if (!Array.isArray(input)) return []
  return input.map((item, index) => ({
    id: clean(item.id) || `discount-${index + 1}`,
    code: normaliseDiscountCode(item.code),
    type: item.type === 'fixed' ? 'fixed' : 'percent',
    value: money(item.value),
    minimumSpend: money(item.minimumSpend),
    maxUses: wholeNumber(item.maxUses),
    uses: wholeNumber(item.uses),
    expiresAt: clean(item.expiresAt),
    active: item.active !== false,
  })).filter(item => item.code)
}

export function normaliseOrderPrefix(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function suggestedOrderPrefix(name = '', id = '') {
  const source = String(name || id).replace(/[^A-Za-z0-9 ]/g, ' ').trim()
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length > 1) return normaliseOrderPrefix(words.map(word => word[0]).join('')).slice(0, 3) || 'WEB'
  return normaliseOrderPrefix(source).slice(-3) || 'WEB'
}

function uniquePrefix(base, used) {
  const normalised = normaliseOrderPrefix(base) || 'WEB'
  if (!used.has(normalised)) return normalised
  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index)
    const candidate = `${normalised.slice(0, 6 - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return `${normalised.slice(0, 3)}999`
}

function sanitise(input = {}) {
  const minimumDays = wholeNumber(input.estimatedDeliveryMinDays, DEFAULTS.estimatedDeliveryMinDays)
  const maximumDays = Math.max(minimumDays, wholeNumber(input.estimatedDeliveryMaxDays, DEFAULTS.estimatedDeliveryMaxDays))
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
    shippingEnabled: input.shippingEnabled !== false,
    standardShippingLabel: clean(input.standardShippingLabel) || DEFAULTS.standardShippingLabel,
    standardShippingRate: money(input.standardShippingRate, DEFAULTS.standardShippingRate),
    freeShippingEnabled: input.freeShippingEnabled === true,
    freeShippingThreshold: money(input.freeShippingThreshold, DEFAULTS.freeShippingThreshold),
    estimatedDeliveryMinDays: minimumDays,
    estimatedDeliveryMaxDays: maximumDays,
    taxEnabled: input.taxEnabled === true,
    taxLabel: clean(input.taxLabel) || DEFAULTS.taxLabel,
    taxRate: Math.min(100, money(input.taxRate, DEFAULTS.taxRate)),
    pricesIncludeTax: input.pricesIncludeTax !== false,
    taxShipping: input.taxShipping !== false,
    taxNumber: clean(input.taxNumber).toUpperCase(),
    discountCodes: sanitiseDiscountCodes(input.discountCodes),
  }
}

export function calculateShipping(settings = {}, product = {}, quantity = 1) {
  const safe = sanitise(settings)
  const subtotal = money(Number(product.priceGBP || 0) * Math.max(1, Number(quantity) || 1))
  if (product.fulfilment === 'digital') return { amount: 0, label: 'Digital delivery', minimumDays: 0, maximumDays: 0, free: true }
  if (!safe.shippingEnabled) return { amount: 0, label: 'Delivery included', minimumDays: 0, maximumDays: 0, free: true }
  const free = safe.freeShippingEnabled && subtotal >= safe.freeShippingThreshold
  return { amount: free ? 0 : safe.standardShippingRate, label: free ? 'Free UK Delivery' : safe.standardShippingLabel, minimumDays: safe.estimatedDeliveryMinDays, maximumDays: safe.estimatedDeliveryMaxDays, free: free || safe.standardShippingRate === 0 }
}

export function calculateTax(settings = {}, productSubtotal = 0, shippingAmount = 0) {
  const safe = sanitise(settings)
  const products = money(productSubtotal)
  const shipping = money(shippingAmount)
  if (!safe.taxEnabled || safe.taxRate <= 0) return { enabled: false, label: safe.taxLabel, rate: 0, included: false, productNet: products, shippingNet: shipping, amount: 0, total: money(products + shipping), number: '' }
  const rate = safe.taxRate / 100
  const taxableShipping = safe.taxShipping ? shipping : 0
  const exemptShipping = safe.taxShipping ? 0 : shipping
  if (safe.pricesIncludeTax) {
    const productNet = money(products / (1 + rate))
    const shippingNet = money(taxableShipping / (1 + rate))
    const amount = money(products + taxableShipping - productNet - shippingNet)
    return { enabled: true, label: safe.taxLabel, rate: safe.taxRate, included: true, productNet, shippingNet: money(shippingNet + exemptShipping), amount, total: money(products + shipping), number: safe.taxNumber }
  }
  const amount = money((products + taxableShipping) * rate)
  return { enabled: true, label: safe.taxLabel, rate: safe.taxRate, included: false, productNet: products, shippingNet: shipping, amount, total: money(products + shipping + amount), number: safe.taxNumber }
}

export function resolveDiscount(settings = {}, suppliedCode = '', subtotal = 0) {
  const code = normaliseDiscountCode(suppliedCode)
  const safeSubtotal = money(subtotal)
  if (!code) return { code: '', amount: 0, valid: false, reason: '' }
  const record = sanitise(settings).discountCodes.find(item => item.code === code)
  if (!record || !record.active) throw new Error('Discount code is invalid')
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) throw new Error('Discount code has expired')
  if (record.maxUses > 0 && record.uses >= record.maxUses) throw new Error('Discount code usage limit has been reached')
  if (safeSubtotal < record.minimumSpend) throw new Error(`Discount code requires a minimum spend of £${record.minimumSpend.toFixed(2)}`)
  const amount = record.type === 'fixed' ? Math.min(safeSubtotal, record.value) : money(safeSubtotal * Math.min(100, record.value) / 100)
  return { code, amount, valid: amount > 0, type: record.type, value: record.value }
}

export async function recordDiscountUse(websiteId, suppliedCode = '') {
  const code = normaliseDiscountCode(suppliedCode)
  if (!code) return
  const file = paths.commerceSettings(safeName(websiteId))
  const current = sanitise(await readJson(file, {}))
  await writeJson(file, { ...current, discountCodes: current.discountCodes.map(item => item.code === code ? { ...item, uses: item.uses + 1 } : item) })
}

function validReturnUrl(value, label, required = false) {
  if (!value && !required) return null
  if (!value) return `${label} is required`
  try {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && local && url.protocol === 'http:')) return null
    return `${label} must use HTTPS${process.env.NODE_ENV !== 'production' ? ' or local HTTP during development' : ''}`
  } catch {
    return `${label} is invalid`
  }
}

function validate(settings) {
  const errors = []
  if (settings.stripeEnabled) {
    errors.push(validReturnUrl(settings.successUrl, 'Stripe success URL', true))
    errors.push(validReturnUrl(settings.cancelUrl, 'Checkout cancel URL', true))
  }
  if (settings.paypalEnabled) {
    errors.push(validReturnUrl(settings.paypalReturnUrl, 'PayPal return URL', true))
    errors.push(validReturnUrl(settings.cancelUrl, 'Checkout cancel URL', true))
  }
  if (settings.discordWebhookUrl) {
    const error = validReturnUrl(settings.discordWebhookUrl, 'Discord webhook URL')
    if (error) errors.push(error)
    else {
      const host = new URL(settings.discordWebhookUrl).hostname
      if (!host.endsWith('discord.com') && !host.endsWith('discordapp.com')) errors.push('Discord webhook must use an official Discord domain')
    }
  }
  if ((settings.stripeEnabled || settings.paypalEnabled) && !settings.orderEmail) errors.push('Order notification email is required')
  if (settings.shippingEnabled && !settings.standardShippingLabel) errors.push('Standard shipping label is required')
  if (settings.taxEnabled && !settings.taxLabel) errors.push('Tax label is required')
  if (settings.taxEnabled && settings.taxRate <= 0) errors.push('Tax rate must be greater than zero')
  const codes = new Set()
  settings.discountCodes.forEach(discount => {
    if (codes.has(discount.code)) errors.push(`Discount code ${discount.code} is duplicated`)
    codes.add(discount.code)
    if (discount.value <= 0) errors.push(`Discount code ${discount.code} must have a value above zero`)
    if (discount.type === 'percent' && discount.value > 100) errors.push(`Discount code ${discount.code} cannot exceed 100%`)
    if (discount.expiresAt && Number.isNaN(new Date(discount.expiresAt).getTime())) errors.push(`Discount code ${discount.code} has an invalid expiry date`)
  })
  return errors.filter(Boolean)
}

export async function getCommerceSettings(websiteId) {
  return sanitise(await readJson(paths.commerceSettings(safeName(websiteId)), {}))
}

async function saveSettings(websiteId, input) {
  const settings = sanitise(input)
  const errors = validate(settings)
  if (errors.length) throw new Error(errors.join('; '))
  return writeJson(paths.commerceSettings(safeName(websiteId)), settings)
}

function canAccessWebsite(session, websiteId) {
  if (!session || !websiteId) return false
  if (session.role === 'owner') return true
  return (session.websiteIds || []).includes(websiteId)
}

async function readiness(websiteId) {
  const id = safeName(websiteId)
  const settings = await getCommerceSettings(id)
  const content = await readJson(paths.content(id), {})
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  const enabledProducts = products.filter(product => product.checkout?.enabled === true && product.availability === 'available')
  const checks = [
    { id: 'catalogue', label: 'At least one checkout-ready product', ready: enabledProducts.length > 0, detail: `${enabledProducts.length} ready of ${products.length} products` },
    { id: 'returns', label: 'Checkout return URLs', ready: validate(settings).filter(error => /URL|required/.test(error)).length === 0, detail: settings.successUrl || settings.paypalReturnUrl || 'Not configured' },
    { id: 'orders', label: 'Order notification email', ready: Boolean(settings.orderEmail), detail: settings.orderEmail || 'Not configured' },
    { id: 'stripe', label: 'Stripe environment', ready: !settings.stripeEnabled || Boolean(process.env.STRIPE_SECRET_KEY), detail: settings.stripeEnabled ? (process.env.STRIPE_SECRET_KEY ? 'Secret key configured' : 'STRIPE_SECRET_KEY missing') : 'Disabled' },
    { id: 'stripe-webhook', label: 'Stripe webhook', ready: !settings.stripeEnabled || Boolean(process.env.STRIPE_WEBHOOK_SECRET), detail: settings.stripeEnabled ? (process.env.STRIPE_WEBHOOK_SECRET ? 'Webhook secret configured' : 'STRIPE_WEBHOOK_SECRET missing') : 'Disabled' },
    { id: 'paypal', label: 'PayPal environment', ready: !settings.paypalEnabled || Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET), detail: settings.paypalEnabled ? (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? `${process.env.PAYPAL_ENVIRONMENT === 'live' ? 'Live' : 'Sandbox'} credentials configured` : 'PayPal credentials missing') : 'Disabled' },
    { id: 'paypal-webhook', label: 'PayPal webhook', ready: !settings.paypalEnabled || Boolean(process.env.PAYPAL_WEBHOOK_ID), detail: settings.paypalEnabled ? (process.env.PAYPAL_WEBHOOK_ID ? 'Webhook ID configured' : 'PAYPAL_WEBHOOK_ID missing') : 'Disabled' },
    { id: 'discord', label: 'Discord order notifications', ready: !settings.discordWebhookUrl || /^https:\/\/(?:[^/]+\.)?(?:discord\.com|discordapp\.com)\//i.test(settings.discordWebhookUrl), detail: settings.discordWebhookUrl ? 'Webhook configured' : 'Optional' },
  ]
  return { websiteId: id, ready: checks.every(check => check.ready), checks, providers: { stripe: settings.stripeEnabled, paypal: settings.paypalEnabled }, productCount: products.length, readyProductCount: enabledProducts.length }
}

export function createWebsiteOrderPrefixGuard() {
  const router = express.Router()
  router.get('/', async (_req, _res, next) => {
    const websites = await readJson(paths.websites(), [])
    const used = new Set(websites.map(site => normaliseOrderPrefix(site.orderPrefix)).filter(Boolean))
    let changed = false
    const nextWebsites = websites.map(site => {
      if (normaliseOrderPrefix(site.orderPrefix)) return site
      const prefix = uniquePrefix(suggestedOrderPrefix(site.name, site.id), used)
      used.add(prefix)
      changed = true
      return { ...site, orderPrefix: prefix }
    })
    if (changed) await writeJson(paths.websites(), nextWebsites)
    next()
  })
  async function validatePrefix(req, res, next) {
    const websites = await readJson(paths.websites(), [])
    const existing = websites.find(site => site.id === req.params.id)
    const prefix = normaliseOrderPrefix(req.body?.orderPrefix || existing?.orderPrefix || suggestedOrderPrefix(req.body?.name, req.params.id))
    if (prefix.length < 2) return res.status(400).json({ error: 'Order prefix must contain 2–6 letters or numbers' })
    const duplicate = websites.find(site => site.id !== req.params.id && normaliseOrderPrefix(site.orderPrefix) === prefix)
    if (duplicate) return res.status(400).json({ error: `Order prefix ${prefix} is already used by ${duplicate.name}` })
    req.body = { ...(req.body || {}), orderPrefix: prefix }
    next()
  }
  router.post('/', async (req, res, next) => { req.params.id = safeName(req.body?.name || 'new-website'); return validatePrefix(req, res, next) })
  router.patch('/:id', validatePrefix)
  return router
}

export function createCommerceSettingsRouter() {
  const router = express.Router()
  router.get('/:websiteId/readiness', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) return res.status(403).json({ error: 'Website access denied' })
    res.json(await readiness(req.params.websiteId))
  })
  router.get('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) return res.status(403).json({ error: 'Website access denied' })
    res.json(await getCommerceSettings(req.params.websiteId))
  })
  router.put('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) return res.status(403).json({ error: 'Website access denied' })
    if (req.session.role !== 'owner' && !req.session.canEdit) return res.status(403).json({ error: 'Edit permission required' })
    try { res.json(await saveSettings(req.params.websiteId, req.body || {})) } catch (error) { res.status(400).json({ error: error.message }) }
  })
  return router
}
