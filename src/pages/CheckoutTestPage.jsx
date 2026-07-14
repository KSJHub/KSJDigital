import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { useWebsites } from '../hooks/useWebsites.js'

function checkoutReady(product = {}) {
  return product.availability === 'available' && product.checkout?.enabled === true && Number(product.priceGBP) > 0
}

export function CheckoutTestPage() {
  const { websites } = useWebsites()
  const [websiteId, setWebsiteId] = useState('')
  const [content, setContent] = useState({})
  const [readiness, setReadiness] = useState(null)
  const [orders, setOrders] = useState([])
  const [productId, setProductId] = useState('')
  const [provider, setProvider] = useState('stripe')
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('Select a website')

  const website = websites.find(site => site.id === websiteId) || websites[0]
  const products = useMemo(() => (content.merch?.products || []).filter(checkoutReady), [content])
  const selectedProduct = products.find(product => product.id === productId) || products[0]
  const latestOrders = useMemo(() => orders.filter(order => order.websiteId === websiteId).slice(0, 8), [orders, websiteId])

  useEffect(() => {
    if (!websiteId && websites[0]?.id) setWebsiteId(websites[0].id)
  }, [websiteId, websites])

  async function refresh(nextWebsiteId = websiteId) {
    if (!nextWebsiteId) return
    setNotice('Loading checkout test data…')
    try {
      const [nextContent, nextReadiness, nextOrders] = await Promise.all([
        api.getContent(nextWebsiteId),
        api.getCommerceReadiness(nextWebsiteId),
        api.getOrders(),
      ])
      setContent(nextContent)
      setReadiness(nextReadiness)
      setOrders(nextOrders)
      const available = (nextContent.merch?.products || []).filter(checkoutReady)
      setProductId(current => available.some(product => product.id === current) ? current : available[0]?.id || '')
      setNotice(available.length ? 'Ready to launch a sandbox checkout' : 'No checkout-ready products found')
    } catch (error) {
      setNotice(error.message || 'Checkout test data unavailable')
    }
  }

  useEffect(() => { if (websiteId) refresh(websiteId) }, [websiteId])

  async function launch() {
    if (!selectedProduct || busy) return
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    setBusy(true)
    setNotice(`Creating ${provider === 'stripe' ? 'Stripe' : 'PayPal'} sandbox checkout…`)
    try {
      const result = await api.createBasketCheckout(provider, {
        websiteId,
        items: [{ productId: selectedProduct.id, quantity, variant: {} }],
      })
      const destination = provider === 'stripe' ? result.url : result.approvalUrl
      if (!destination) throw new Error('The payment provider did not return a checkout URL')
      if (popup) popup.location.href = destination
      else window.open(destination, '_blank', 'noopener,noreferrer')
      setNotice('Sandbox checkout opened. Complete it, then return here and refresh results.')
    } catch (error) {
      if (popup) popup.close()
      setNotice(error.message || 'Checkout could not be started')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Checkout Test Centre">
      <section className="moduleHero card checkoutTestHero">
        <div><span>Sandbox Validation</span><h2>{website?.name || 'Website'} Checkout Test</h2><p>Launch a real sandbox payment, then verify that the order, inventory and notifications completed correctly.</p></div>
        <div className="checkoutTestActions"><select value={websiteId} onChange={event => setWebsiteId(event.target.value)}>{websites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select><button onClick={() => refresh()}>Refresh Results</button><span>{notice}</span></div>
      </section>

      <section className="checkoutTestGrid">
        <div className="card checkoutTestPanel">
          <div className="panelHead"><h2>1. Launch Payment</h2><span>Sandbox only</span></div>
          <label>Provider<select value={provider} onChange={event => setProvider(event.target.value)}><option value="stripe">Stripe</option><option value="paypal">PayPal</option></select></label>
          <label>Product<select value={selectedProduct?.id || ''} onChange={event => setProductId(event.target.value)}>{products.map(product => <option key={product.id} value={product.id}>{product.name} · £{Number(product.priceGBP).toFixed(2)}</option>)}</select></label>
          <label>Quantity<input type="number" min="1" max="10" value={quantity} onChange={event => setQuantity(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} /></label>
          {selectedProduct ? <article className="checkoutTestProduct"><strong>{selectedProduct.name}</strong><span>£{Number(selectedProduct.priceGBP).toFixed(2)} each</span><small>{selectedProduct.inventory?.trackStock ? `${selectedProduct.inventory?.quantity || 0} currently in stock` : selectedProduct.fulfilmentOptions?.madeToOrder ? 'Made to order' : 'Stock not tracked'}</small></article> : <p className="emptyState">Enable checkout on at least one available product first.</p>}
          <button className="primary" disabled={!selectedProduct || busy || (provider === 'stripe' ? !readiness?.providers?.stripe?.ready : !readiness?.providers?.paypal?.ready)} onClick={launch}>{busy ? 'Creating Checkout…' : `Open ${provider === 'stripe' ? 'Stripe' : 'PayPal'} Sandbox`}</button>
        </div>

        <div className="card checkoutTestPanel">
          <div className="panelHead"><h2>2. Readiness</h2><span>{readiness?.ready ? 'Ready' : 'Incomplete'}</span></div>
          {(readiness?.checks || []).map(check => <div className={`checkoutCheck ${check.ready ? 'ready' : 'missing'}`} key={check.id}><b>{check.ready ? '✓' : '!'}</b><span><strong>{check.label}</strong><small>{check.message}</small></span></div>)}
          {!readiness && <p>Loading readiness checks…</p>}
        </div>

        <div className="card checkoutTestPanel checkoutResultsPanel">
          <div className="panelHead"><h2>3. Verify Results</h2><span>{latestOrders.length} recent</span></div>
          <div className="checkoutVerifyList">
            <div><b>Order created</b><span>Confirm a new order number appears below.</span></div>
            <div><b>Stock reduced</b><span>Refresh and compare the selected product quantity.</span></div>
            <div><b>Email sent</b><span>Check the configured order and customer inboxes.</span></div>
            <div><b>Discord sent</b><span>Check the configured private order webhook.</span></div>
            <div><b>Refund ready</b><span>Open the order in Orders after payment completes.</span></div>
          </div>
          <div className="checkoutOrderList">{latestOrders.map(order => <article key={order.id}><div><strong>{order.orderNumber || order.id}</strong><small>{order.provider || order.paymentProvider} · {order.status}</small></div><span>£{Number(order.total || order.amount || 0).toFixed(2)}</span><button onClick={() => { location.href = '/owner/orders' }}>Open Orders</button></article>)}{!latestOrders.length && <p className="emptyState">No completed orders for this website yet.</p>}</div>
        </div>
      </section>
    </Layout>
  )
}
