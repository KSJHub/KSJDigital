import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dataDir = path.join(root, 'server-data')

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
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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

function suggestedPrefix(website = {}) {
  const known = {
    twotonetaj: 'TAJ',
    ksjdiamondgaming: 'DIA',
    goliath: 'GOL',
  }
  const id = String(website.id || '').toLowerCase()
  if (known[id]) return known[id]

  const name = String(website.name || website.id || 'WEB')
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const initials = normalisePrefix(words.map(word => word[0]).join(''))
    if (initials) return initials.slice(0, 3)
  }
  return normalisePrefix(name).slice(0, 3) || 'WEB'
}

function uniquePrefix(base, used) {
  const normalised = normalisePrefix(base) || 'WEB'
  if (!used.has(normalised)) return normalised
  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index)
    const candidate = `${normalised.slice(0, 6 - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
  return `${normalised.slice(0, 3)}999`
}

function repairOrderPrefixes(websitesFile, websites) {
  const used = new Set(
    websites.map(website => normalisePrefix(website.orderPrefix)).filter(Boolean),
  )
  let changed = false
  const repaired = websites.map(website => {
    const existing = normalisePrefix(website.orderPrefix)
    if (existing) return { ...website, orderPrefix: existing }

    const orderPrefix = uniquePrefix(suggestedPrefix(website), used)
    used.add(orderPrefix)
    changed = true
    return { ...website, orderPrefix }
  })

  if (changed) writeJson(websitesFile, repaired)
  return { websites: repaired, changed }
}

function line(status, label, detail = '') {
  const symbol = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : 'FAIL'
  console.log(`${symbol.padEnd(4)}  ${label}${detail ? ` — ${detail}` : ''}`)
}

loadEnvironmentFile('.env')
loadEnvironmentFile('.env.local')

const websitesFile = path.join(dataDir, 'websites.json')
const storedWebsites = readJson(websitesFile, [])
const repaired = repairOrderPrefixes(websitesFile, storedWebsites)
const websites = repaired.websites
const clients = readJson(path.join(dataDir, 'clients.json'), [])
const settingsDir = path.join(dataDir, 'commerce-settings')
const contentDir = path.join(dataDir, 'content')

let failures = 0
let warnings = 0

function pass(label, detail = '') {
  line('pass', label, detail)
}

function warn(label, detail = '') {
  warnings += 1
  line('warn', label, detail)
}

function fail(label, detail = '') {
  failures += 1
  line('fail', label, detail)
}

console.log('\nKSJ Digital launch readiness\n')

const production = process.env.NODE_ENV === 'production'
if (present(process.env.SESSION_SECRET) && process.env.SESSION_SECRET.length >= 32) {
  pass('Session secret', 'configured')
} else if (production) {
  fail('Session secret', 'set SESSION_SECRET to at least 32 characters')
} else {
  warn('Session secret', 'development only; set at least 32 characters before production')
}

if (production) pass('Runtime mode', 'production')
else warn('Runtime mode', `currently ${process.env.NODE_ENV || 'development'}`)

for (const [key, label] of [
  ['KSJ_OWNER_PASSWORD', 'Owner password'],
  ['TWOTONETAJ_CLIENT_PASSWORD', 'TwoToneTaj client password'],
  ['GOLIATH_CLIENT_PASSWORD', 'Goliath client password'],
]) {
  if (present(process.env[key])) pass(label, 'private environment value configured')
  else if (production) fail(label, `${key} is blank in production`)
  else warn(label, 'blank; development fallback remains active')
}

if (repaired.changed) pass('Order-prefix migration', 'missing prefixes were assigned and saved')
if (!websites.length) warn('Websites', 'no stored website records found yet')

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

  if (present(website.orderPrefix)) pass('Order prefix', website.orderPrefix)
  else fail('Order prefix', 'required for unique client order numbers')

  if (clientAccounts.length) pass('Client access', `${clientAccounts.length} account(s) assigned`)
  else warn('Client access', 'no client account assigned')

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
  } else {
    warn('Stripe', 'disabled for this website')
  }

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
  } else {
    warn('PayPal', 'disabled for this website')
  }

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
