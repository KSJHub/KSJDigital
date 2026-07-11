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
}

function clean(value = '') {
  return typeof value === 'string' ? value.trim() : value
}

export function normaliseOrderPrefix(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function suggestedOrderPrefix(name = '', id = '') {
  const source = String(name || id)
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return normaliseOrderPrefix(words.map(word => word[0]).join('')).slice(0, 3) || 'WEB'
  }
  const compact = normaliseOrderPrefix(source)
  return compact.slice(-3) || 'WEB'
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

function validateHttpsUrl(value, label, required = false) {
  if (!value && !required) return null
  if (!value) return `${label} is required`
  try {
    return new URL(value).protocol === 'https:' ? null : `${label} must use HTTPS`
  } catch {
    return `${label} is invalid`
  }
}

function validate(settings) {
  const errors = []
  if (settings.stripeEnabled) {
    errors.push(validateHttpsUrl(settings.successUrl, 'Stripe success URL', true))
    errors.push(validateHttpsUrl(settings.cancelUrl, 'Checkout cancel URL', true))
  }
  if (settings.paypalEnabled) {
    errors.push(validateHttpsUrl(settings.paypalReturnUrl, 'PayPal return URL', true))
    errors.push(validateHttpsUrl(settings.cancelUrl, 'Checkout cancel URL', true))
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
    const requested = req.body?.orderPrefix
    const prefix = normaliseOrderPrefix(
      requested || existing?.orderPrefix || suggestedOrderPrefix(req.body?.name, req.params.id),
    )

    if (prefix.length < 2) {
      return res.status(400).json({ error: 'Order prefix must contain 2–6 letters or numbers' })
    }

    const duplicate = websites.find(
      site => site.id !== req.params.id && normaliseOrderPrefix(site.orderPrefix) === prefix,
    )
    if (duplicate) {
      return res.status(400).json({ error: `Order prefix ${prefix} is already used by ${duplicate.name}` })
    }

    req.body = { ...(req.body || {}), orderPrefix: prefix }
    next()
  }

  router.post('/', async (req, res, next) => {
    req.params.id = safeName(req.body?.name || 'new-website')
    return validatePrefix(req, res, next)
  })
  router.patch('/:id', validatePrefix)

  return router
}

export function createCommerceSettingsRouter() {
  const router = express.Router()

  router.get('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    res.json(await getCommerceSettings(req.params.websiteId))
  })

  router.put('/:websiteId', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      res.json(await saveSettings(req.params.websiteId, req.body || {}))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
