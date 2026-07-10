import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const defaults = {
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

export function CommerceSettingsPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const availableWebsites = client
    ? websites.filter(site => account?.websiteIds?.includes(site.id))
    : websites
  const [websiteId, setWebsiteId] = useState(assignedWebsite?.id || availableWebsites[0]?.id || '')
  const [settings, setSettings] = useState(defaults)
  const [notice, setNotice] = useState('Loading')
  const canEdit = account?.role === 'owner' || account?.canEdit

  async function load(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) return setNotice('No website assigned')
    setWebsiteId(nextWebsiteId)
    setNotice('Loading')
    try {
      setSettings({ ...defaults, ...(await api.getCommerceSettings(nextWebsiteId)) })
      setNotice(canEdit ? 'Ready' : 'Preview only')
    } catch (error) {
      setNotice(error.message || 'Settings unavailable')
    }
  }

  useEffect(() => {
    if (websiteId) load(websiteId)
  }, [websiteId])

  function update(key, value) {
    setSettings(current => ({ ...current, [key]: value }))
  }

  async function save() {
    if (!canEdit) return setNotice('Edit permission required')
    if (!websiteId) return setNotice('No website assigned')
    setNotice('Saving')
    try {
      setSettings(await api.saveCommerceSettings(websiteId, settings))
      setNotice('Commerce settings saved')
    } catch (error) {
      setNotice(error.message || 'Save failed')
    }
  }

  const selectedWebsite = websites.find(site => site.id === websiteId)

  return (
    <Layout client={client} title="Commerce Settings">
      <section className="moduleHero card">
        <div>
          <span>Protected Commerce Settings</span>
          <h2>{selectedWebsite?.name || 'Website'} Payments & Notifications</h2>
          <p>Configure checkout redirects and private order notifications. Payment secrets remain in the server environment.</p>
        </div>
        <button onClick={save} disabled={!canEdit}>{notice}</button>
      </section>

      {!client && availableWebsites.length > 1 && (
        <section className="card formSettings">
          <label>Website<select value={websiteId} onChange={event => load(event.target.value)}>{availableWebsites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        </section>
      )}

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel">
          <div className="panelHead"><h2>Payment Providers</h2><span>Server managed</span></div>
          <label className="formCheck"><input type="checkbox" checked={settings.stripeEnabled} disabled={!canEdit} onChange={event => update('stripeEnabled', event.target.checked)} /> Enable Stripe checkout</label>
          <label className="formCheck"><input type="checkbox" checked={settings.paypalEnabled} disabled={!canEdit} onChange={event => update('paypalEnabled', event.target.checked)} /> Enable PayPal checkout</label>
          <label>Successful Payment URL<input type="url" value={settings.successUrl} disabled={!canEdit} onChange={event => update('successUrl', event.target.value)} placeholder="https://twotonetaj.ksjdigital.co.uk/merch/success" /></label>
          <label>Cancelled Checkout URL<input type="url" value={settings.cancelUrl} disabled={!canEdit} onChange={event => update('cancelUrl', event.target.value)} placeholder="https://twotonetaj.ksjdigital.co.uk/merch/cancelled" /></label>
          <label>PayPal Return URL<input type="url" value={settings.paypalReturnUrl} disabled={!canEdit} onChange={event => update('paypalReturnUrl', event.target.value)} placeholder="https://twotonetaj.ksjdigital.co.uk/merch/paypal-return" /></label>
          <section className="card publishBox">
            <h3>Secrets are not stored here</h3>
            <p>Stripe secret keys, webhook secrets and PayPal client secrets stay in protected VPS environment variables.</p>
          </section>
        </div>

        <div className="card managerPanel">
          <div className="panelHead"><h2>Order Emails</h2><span>Private</span></div>
          <label>Order Notification Email<input type="email" value={settings.orderEmail} disabled={!canEdit} onChange={event => update('orderEmail', event.target.value)} placeholder="orders@ksjdigital.co.uk" /></label>
          <label>Customer Support Email<input type="email" value={settings.supportEmail} disabled={!canEdit} onChange={event => update('supportEmail', event.target.value)} placeholder="support@ksjdigital.co.uk" /></label>
          <label>Reply-To Email<input type="email" value={settings.replyTo} disabled={!canEdit} onChange={event => update('replyTo', event.target.value)} /></label>
          <label>Delivery Message<textarea value={settings.deliveryMessage} disabled={!canEdit} onChange={event => update('deliveryMessage', event.target.value)} /></label>
          <label>Returns Message<textarea value={settings.returnsMessage} disabled={!canEdit} onChange={event => update('returnsMessage', event.target.value)} /></label>
        </div>

        <div className="card managerPanel">
          <div className="panelHead"><h2>Discord Orders</h2><span>Private webhook</span></div>
          <label>Discord Webhook URL<input type="password" value={settings.discordWebhookUrl} disabled={!canEdit} onChange={event => update('discordWebhookUrl', event.target.value)} placeholder="https://discord.com/api/webhooks/..." autoComplete="off" /></label>
          <section className="card publishBox">
            <h3>Privacy protection</h3>
            <p>Discord receives the order number, products, total, masked email and delivery country only. Full addresses and payment details remain in KSJ Digital.</p>
          </section>
          <button onClick={save} disabled={!canEdit}>Save Commerce Settings</button>
        </div>
      </section>
    </Layout>
  )
}
