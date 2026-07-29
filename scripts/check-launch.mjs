import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'server-data')
const ACTIVE_WEBSITE_IDS = new Set(['ksjdigital', 'twotonetaj'])

function loadEnvironmentFile(filename) {
  const file = path.join(root, filename)
  if (!fs.existsSync(file)) return

  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return fallback
  }
}

function present(value) {
  return Boolean(String(value || '').trim())
}

function httpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function httpsOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.origin === String(value || '').trim().replace(/\/$/, '')
  } catch {
    return false
  }
}

function configuredTrustedOrigins() {
  return [...new Set(
    [process.env.KSJ_PORTAL_ORIGIN, ...(process.env.KSJ_ALLOWED_ORIGINS || '').split(',')]
      .map(value => String(value || '').trim().replace(/\/$/, ''))
      .filter(Boolean),
  )]
}

function localOrHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (
      url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

function normalisePrefix(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function activeWebsiteState(websites) {
  const active = websites.filter(website => ACTIVE_WEBSITE_IDS.has(String(website.id || '').toLowerCase()))
  return { active, inactiveCount: websites.length - active.length }
}

function line(status, label, detail = '') {
  const symbol = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : 'FAIL'
  console.log(`${symbol.padEnd(4)}  ${label}${detail ? ` — ${detail}` : ''}`)
}

loadEnvironmentFile('.env')
loadEnvironmentFile('.env.local')

const websitesFile = path.join(dataDir, 'websites.json')
const storedWebsites = readJson(websitesFile, [])
const websiteState = activeWebsiteState(storedWebsites)
const websites = websiteState.active
const clients = readJson(path.join(dataDir, 'clients.json'), [])
const settingsDir = path.join(dataDir, 'commerce-settings')
const contentDir = path.join(dataDir, 'content')
const configurationRegistry = readJson(path.join(dataDir, 'configuration', 'registry.json'), {})

let failures = 0
let warnings = 0
const pass = (label, detail = '') => line('pass', label, detail)
const warn = (label, detail = '') => { warnings += 1; line('warn', label, detail) }
const fail = (label, detail = '') => { failures += 1; line('fail', label, detail) }

console.log('\nKSJ Digital launch readiness\n')

const production = process.env.NODE_ENV === 'production'
if (present(process.env.SESSION_SECRET) && process.env.SESSION_SECRET.length >= 32) pass('Session secret', 'configured')
else if (production) fail('Session secret', 'set SESSION_SECRET to at least 32 characters')
else warn('Session secret', 'development only; set at least 32 characters before production')

if (production) pass('Runtime mode', 'production')
else warn('Runtime mode', `currently ${process.env.NODE_ENV || 'development'}`)

if (present(process.env.INTEGRATION_SIGNING_SECRET)) pass('Integration signing secret', 'configured')
else if (production) fail('Integration signing secret', 'INTEGRATION_SIGNING_SECRET is required in production')
else warn('Integration signing secret', 'blank; configure before production')

const trustedOrigins = configuredTrustedOrigins()
if (production) {
  if (!trustedOrigins.length) fail('Trusted origins', 'set KSJ_PORTAL_ORIGIN or KSJ_ALLOWED_ORIGINS')
  else if (!trustedOrigins.every(httpsOrigin)) fail('Trusted origins', 'production origins must be canonical HTTPS origins without paths, queries, fragments, or credentials')
  else pass('Trusted origins', `${trustedOrigins.length} approved HTTPS origin(s)`)
} else if (trustedOrigins.length) pass('Trusted origins', `${trustedOrigins.length} configured`)
else warn('Trusted origins', 'blank; production requests require approved origins')

const storedSecrets = Object.values(configurationRegistry.secrets || {}).filter(secret => secret?.source === 'stored')
if (storedSecrets.length) {
  if (String(process.env.CONFIGURATION_MASTER_KEY || '').length >= 32) pass('Configuration master key', 'configured for stored secrets')
  else fail('Configuration master key', 'CONFIGURATION_MASTER_KEY must contain at least 32 characters when encrypted stored secrets exist')
} else if (String(process.env.CONFIGURATION_MASTER_KEY || '').length >= 32) pass('Configuration master key', 'configured')
else warn('Configuration master key', 'not required while no encrypted stored secrets are configured')

for (const [key, label] of [
  ['KSJ_OWNER_PASSWORD', 'Owner password'],
  ['TWOTONETAJ_CLIENT_PASSWORD', 'TwoToneTaj client password'],
]) {
  if (present(process.env[key])) pass(label, 'private environment value configured')
  else if (production) fail(label, `${key} is blank in production`)
  else warn(label, 'blank; development fallback remains active')
}

if (websiteState.inactiveCount) warn('Stored website records', `${websiteState.inactiveCount} inactive record(s) remain; readiness checks do not modify stored data`)
if (!websites.length) warn('Websites', 'no active website records found yet')

const seenOrderPrefixes = new Set()
for (const website of websites) {
  const websiteId = String(website.id || '').trim()
  if (!websiteId) continue
  console.log(`\n[${website.name || websiteId}]`)

  const settings = readJson(path.join(settingsDir, `${websiteId}.json`), {})
  const content = readJson(path.join(contentDir, `${websiteId}.json`), {})
  const products = Array.isArray(content.merch?.products) ? content.merch.products : []
  const enabledProducts = products.filter(product => product.checkout?.enabled === true)
  const clientAccounts = clients.filter(client =>
    client.websiteId === websiteId || (client.websiteIds || []).includes(websiteId),
  )

  const rawOrderPrefix = String(website.orderPrefix || '').trim()
  const orderPrefix = normalisePrefix(rawOrderPrefix)
  if (!rawOrderPrefix) fail('Order prefix', 'required for unique client order numbers')
  else if (rawOrderPrefix !== orderPrefix) fail('Order prefix', 'must already be normalised to 1-6 uppercase letters or digits')
  else if (seenOrderPrefixes.has(orderPrefix)) fail('Order prefix', `duplicate prefix ${orderPrefix}`)
  else {
    seenOrderPrefixes.add(orderPrefix)
    pass('Order prefix', orderPrefix)
  }

  if (clientAccounts.length) pass('Account access', `${clientAccounts.length} account(s) assigned`)
  else warn('Account access', 'no account assigned')

  if (products.length) pass('Merch catalogue', `${products.length} product(s) stored`)
  else warn('Merch catalogue', 'no products stored')

  if (enabledProducts.length) pass('Checkout products', `${enabledProducts.length} enabled`)
  else warn('Checkout products', 'none enabled')

  const supportEmail = settings.orderEmail || settings.supportEmail || content.contact?.businessEmail || content.contact?.supportEmail
  if (present(supportEmail)) pass('Order recipient', 'dedicated or fallback email available')
  else if (settings.stripeEnabled || settings.paypalEnabled) fail('Order recipient', 'set order or support email')
  else warn('Order recipient', 'not configured')

  if (settings.stripeEnabled) {
    if (present(process.env.STRIPE_SECRET_KEY)) pass('Stripe secret key', 'configured')
    else fail('Stripe secret key', 'STRIPE_SECRET_KEY is blank')
    if (present(process.env.STRIPE_WEBHOOK_SECRET)) pass('Stripe webhook secret', 'configured')
    else fail('Stripe webhook secret', 'STRIPE_WEBHOOK_SECRET is blank')
    if (localOrHttpsUrl(settings.successUrl || process.env.STRIPE_SUCCESS_URL)) pass('Stripe success URL')
    else fail('Stripe success URL', 'missing or invalid')
    if (localOrHttpsUrl(settings.cancelUrl || process.env.STRIPE_CANCEL_URL)) pass('Stripe cancel URL')
    else fail('Stripe cancel URL', 'missing or invalid')
  } else warn('Stripe', 'disabled for this website')

  if (settings.paypalEnabled) {
    if (present(process.env.PAYPAL_CLIENT_ID)) pass('PayPal client ID', 'configured')
    else fail('PayPal client ID', 'PAYPAL_CLIENT_ID is blank')
    if (present(process.env.PAYPAL_CLIENT_SECRET)) pass('PayPal client secret', 'configured')
    else fail('PayPal client secret', 'PAYPAL_CLIENT_SECRET is blank')
    if (present(process.env.PAYPAL_WEBHOOK_ID)) pass('PayPal webhook ID', 'configured')
    else fail('PayPal webhook ID', 'PAYPAL_WEBHOOK_ID is blank')
    if (localOrHttpsUrl(settings.paypalReturnUrl || process.env.PAYPAL_RETURN_URL)) pass('PayPal return URL')
    else fail('PayPal return URL', 'missing or invalid')
    if (localOrHttpsUrl(settings.cancelUrl || process.env.PAYPAL_CANCEL_URL)) pass('PayPal cancel URL')
    else fail('PayPal cancel URL', 'missing or invalid')
  } else warn('PayPal', 'disabled for this website')

  if (present(process.env.RESEND_API_KEY)) pass('Email provider', 'Resend key configured')
  else warn('Email provider', 'RESEND_API_KEY is blank; order emails will record Failed')

  if (present(process.env.ORDER_EMAIL_FROM)) pass('Sender address', 'configured')
  else warn('Sender address', 'ORDER_EMAIL_FROM is blank')

  const webhook = settings.discordWebhookUrl || process.env.ORDER_DISCORD_WEBHOOK_URL
  if (present(webhook) && httpsUrl(webhook)) pass('Discord order webhook', 'configured')
  else warn('Discord order webhook', 'blank or invalid; Discord delivery will record Failed')
}

console.log(`\nResult: ${failures} failure(s), ${warnings} warning(s).`)
if (failures) {
  console.error('Launch readiness failed. Fix the FAIL items before live payments.')
  process.exitCode = 1
} else {
  console.log('No blocking launch configuration failures found.')
}
