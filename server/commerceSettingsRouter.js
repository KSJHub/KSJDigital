import express from 'express'
import { testCommerceNotification } from './orderNotificationService.js'
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

  router.post('/:websiteId/test/:channel', async (req, res) => {
    if (!canAccessWebsite(req.session, req.params.websiteId)) {
      return res.status(403).json({ error: 'Website access denied' })
    }
    if (req.session.role !== 'owner' && !req.session.canEdit) {
      return res.status(403).json({ error: 'Edit permission required' })
    }

    try {
      const settings = await getCommerceSettings(req.params.websiteId)
      await testCommerceNotification(req.params.channel, {
        ...settings,
        brandName: req.body?.brandName || req.params.websiteId,
      })
      res.json({ ok: true, channel: req.params.channel })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })

  return router
}
