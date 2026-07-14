import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

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

const tabs = ['Readiness', 'Payments', 'Shipping', 'Tax', 'Notifications', 'Discounts']

function newDiscount() {
  return { id: crypto.randomUUID(), code: '', type: 'percent', value: 10, minimumSpend: 0, maxUses: 0, uses: 0, expiresAt: '', active: true }
}

export function CommerceSettingsV2Page({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assigned = findClientWebsite(websites, account)
  const allowed = client ? websites.filter(site => account?.websiteIds?.includes(site.id)) : websites
  const [websiteId, setWebsiteId] = useState(assigned?.id || allowed[0]?.id || '')
  const website = websites.find(site => site.id === websiteId)
  const [settings, setSettings] = useState(defaults)
  const [readiness, setReadiness] = useState(null)
  const [tab, setTab] = useState('Readiness')
  const [notice, setNotice] = useState('Loading')
  const [saving, setSaving] = useState(false)
  const canEdit = account?.role === 'owner' || account?.canEdit

  const readyCount = useMemo(() => readiness?.checks?.filter(check => check.ready).length || 0, [readiness])

  async function load(id = websiteId) {
    if (!id) return setNotice('No website assigned')
    setWebsiteId(id)
    setNotice('Loading')
    try {
      const [nextSettings, nextReadiness] = await Promise.all([
        api.getCommerceSettings(id),
        api.getCommerceReadiness(id),
      ])
      setSettings({ ...defaults, ...nextSettings })
      setReadiness(nextReadiness)
      setNotice(canEdit ? 'Ready' : 'Preview only')
    } catch (error) {
      setNotice(error.message || 'Commerce unavailable')
    }
  }

  useEffect(() => { if (websiteId) load(websiteId) }, [websiteId])

  function update(key, value) {
    setSettings(current => ({ ...current, [key]: value }))
  }

  function updateDiscount(id, key, value) {
    setSettings(current => ({ ...current, discountCodes: current.discountCodes.map(item => item.id === id ? { ...item, [key]: value } : item) }))
  }

  async function save() {
    if (!canEdit || !websiteId || saving) return
    setSaving(true)
    setNotice('Saving…')
    try {
      const saved = await api.saveCommerceSettings(websiteId, settings)
      setSettings({ ...defaults, ...saved })
      setReadiness(await api.getCommerceReadiness(websiteId))
      setNotice('✓ Commerce settings saved')
    } catch (error) {
      setNotice(error.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout client={client} title="Commerce">
      <section className="moduleHero card commerceV2Hero">
        <div>
          <span>Website-level Commerce</span>
          <h2>{website?.name || 'Website'} Checkout</h2>
          <p>Configure payment providers, return URLs, delivery, tax, notifications and discounts once for the whole website.</p>
        </div>
        <div className="commerceV2Actions">
          {!client && allowed.length > 1 && <select value={websiteId} onChange={event => load(event.target.value)}>{allowed.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select>}
          <button onClick={save} disabled={!canEdit || saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
          <span>{notice}</span>
        </div>
      </section>

      <nav className="card commerceTabs" aria-label="Commerce settings sections">
        {tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {tab === 'Readiness' && (
        <section className="commerceReadinessGrid">
          <article className={`card commerceReadinessSummary ${readiness?.ready ? 'ready' : ''}`}>
            <span>{readiness?.ready ? 'Ready for checkout testing' : 'Setup incomplete'}</span>
            <strong>{readyCount}/{readiness?.checks?.length || 0}</strong>
            <p>{readiness?.ready ? 'All configured providers and store requirements are ready for an end-to-end test.' : 'Complete the remaining checks before running a sandbox payment.'}</p>
          </article>
          <div className="card commerceCheckList">
            {(readiness?.checks || []).map(check => <article key={check.id} className={check.ready ? 'ready' : 'warning'}><span>{check.ready ? '✓' : '!'}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></article>)}
          </div>
        </section>
      )}

      {tab === 'Payments' && <section className="card commercePanel"><div className="panelHead"><h2>Payment Providers</h2><span>Website-wide</span></div><label className="formCheck"><input type="checkbox" checked={settings.stripeEnabled} disabled={!canEdit} onChange={event => update('stripeEnabled', event.target.checked)} /> Enable Stripe</label><label className="formCheck"><input type="checkbox" checked={settings.paypalEnabled} disabled={!canEdit} onChange={event => update('paypalEnabled', event.target.checked)} /> Enable PayPal</label><div className="commerceFields"><label>Successful Payment URL<input type="url" value={settings.successUrl} disabled={!canEdit} onChange={event => update('successUrl', event.target.value)} placeholder="http://localhost:5174/merch/success" /></label><label>Cancelled Checkout URL<input type="url" value={settings.cancelUrl} disabled={!canEdit} onChange={event => update('cancelUrl', event.target.value)} placeholder="http://localhost:5174/merch/cancelled" /></label><label>PayPal Return URL<input type="url" value={settings.paypalReturnUrl} disabled={!canEdit} onChange={event => update('paypalReturnUrl', event.target.value)} placeholder="http://localhost:5174/merch/paypal-return" /></label></div><div className="commerceNotice"><strong>Protected secrets</strong><p>Stripe and PayPal secret credentials remain in <code>.env.local</code> and are never exposed to clients.</p></div></section>}

      {tab === 'Shipping' && <section className="card commercePanel"><div className="panelHead"><h2>Shipping</h2><span>Physical products</span></div><label className="formCheck"><input type="checkbox" checked={settings.shippingEnabled} disabled={!canEdit} onChange={event => update('shippingEnabled', event.target.checked)} /> Charge delivery</label><div className="commerceFields"><label>Delivery Name<input value={settings.standardShippingLabel} disabled={!canEdit || !settings.shippingEnabled} onChange={event => update('standardShippingLabel', event.target.value)} /></label><label>Delivery Price (£)<input type="number" min="0" step="0.01" value={settings.standardShippingRate} disabled={!canEdit || !settings.shippingEnabled} onChange={event => update('standardShippingRate', Number(event.target.value))} /></label><label>Minimum Delivery Days<input type="number" min="0" value={settings.estimatedDeliveryMinDays} disabled={!canEdit || !settings.shippingEnabled} onChange={event => update('estimatedDeliveryMinDays', Number(event.target.value))} /></label><label>Maximum Delivery Days<input type="number" min="0" value={settings.estimatedDeliveryMaxDays} disabled={!canEdit || !settings.shippingEnabled} onChange={event => update('estimatedDeliveryMaxDays', Number(event.target.value))} /></label></div><label className="formCheck"><input type="checkbox" checked={settings.freeShippingEnabled} disabled={!canEdit || !settings.shippingEnabled} onChange={event => update('freeShippingEnabled', event.target.checked)} /> Free shipping above threshold</label>{settings.freeShippingEnabled && <label>Free Shipping From (£)<input type="number" min="0" step="0.01" value={settings.freeShippingThreshold} disabled={!canEdit} onChange={event => update('freeShippingThreshold', Number(event.target.value))} /></label>}</section>}

      {tab === 'Tax' && <section className="card commercePanel"><div className="panelHead"><h2>VAT / Tax</h2><span>Optional</span></div><label className="formCheck"><input type="checkbox" checked={settings.taxEnabled} disabled={!canEdit} onChange={event => update('taxEnabled', event.target.checked)} /> Store is tax registered</label><div className="commerceFields"><label>Tax Label<input value={settings.taxLabel} disabled={!canEdit || !settings.taxEnabled} onChange={event => update('taxLabel', event.target.value)} /></label><label>Tax Rate (%)<input type="number" min="0" max="100" value={settings.taxRate} disabled={!canEdit || !settings.taxEnabled} onChange={event => update('taxRate', Number(event.target.value))} /></label><label>Tax Number<input value={settings.taxNumber} disabled={!canEdit || !settings.taxEnabled} onChange={event => update('taxNumber', event.target.value)} /></label></div><label className="formCheck"><input type="checkbox" checked={settings.pricesIncludeTax} disabled={!canEdit || !settings.taxEnabled} onChange={event => update('pricesIncludeTax', event.target.checked)} /> Prices already include tax</label><label className="formCheck"><input type="checkbox" checked={settings.taxShipping} disabled={!canEdit || !settings.taxEnabled} onChange={event => update('taxShipping', event.target.checked)} /> Apply tax to shipping</label></section>}

      {tab === 'Notifications' && <section className="card commercePanel"><div className="panelHead"><h2>Orders & Notifications</h2><span>Private</span></div><div className="commerceFields"><label>Order Notification Email<input type="email" value={settings.orderEmail} disabled={!canEdit} onChange={event => update('orderEmail', event.target.value)} /></label><label>Customer Support Email<input type="email" value={settings.supportEmail} disabled={!canEdit} onChange={event => update('supportEmail', event.target.value)} /></label><label>Reply-To Email<input type="email" value={settings.replyTo} disabled={!canEdit} onChange={event => update('replyTo', event.target.value)} /></label><label>Discord Webhook URL<input type="password" value={settings.discordWebhookUrl} disabled={!canEdit} onChange={event => update('discordWebhookUrl', event.target.value)} autoComplete="off" /></label></div><label>Delivery Message<textarea value={settings.deliveryMessage} disabled={!canEdit} onChange={event => update('deliveryMessage', event.target.value)} /></label><label>Returns Message<textarea value={settings.returnsMessage} disabled={!canEdit} onChange={event => update('returnsMessage', event.target.value)} /></label></section>}

      {tab === 'Discounts' && <section className="card commercePanel"><div className="panelHead"><h2>Discount Codes</h2><button disabled={!canEdit} onClick={() => update('discountCodes', [...settings.discountCodes, newDiscount()])}>Add Code</button></div><div className="discountGrid">{settings.discountCodes.map(discount => <article className="commerceDiscount" key={discount.id}><div className="panelHead"><strong>{discount.code || 'New code'}</strong><button disabled={!canEdit} onClick={() => update('discountCodes', settings.discountCodes.filter(item => item.id !== discount.id))}>Remove</button></div><label className="formCheck"><input type="checkbox" checked={discount.active} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'active', event.target.checked)} /> Active</label><label>Code<input value={discount.code} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'code', event.target.value.toUpperCase())} /></label><label>Type<select value={discount.type} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'type', event.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label><label>Value<input type="number" min="0" value={discount.value} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'value', Number(event.target.value))} /></label><label>Minimum Spend<input type="number" min="0" value={discount.minimumSpend} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'minimumSpend', Number(event.target.value))} /></label><label>Maximum Uses<input type="number" min="0" value={discount.maxUses} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'maxUses', Number(event.target.value))} /></label><label>Expires<input type="date" value={discount.expiresAt?.slice(0, 10) || ''} disabled={!canEdit} onChange={event => updateDiscount(discount.id, 'expiresAt', event.target.value)} /></label><small>Used {discount.uses || 0}{discount.maxUses > 0 ? ` of ${discount.maxUses}` : ' times'}.</small></article>)}</div>{!settings.discountCodes.length && <p className="emptyState">No discount codes configured.</p>}</section>}
    </Layout>
  )
}
