import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const statuses = ['New', 'Processing', 'Awaiting Stock', 'Dispatched', 'Delivered', 'Cancelled', 'Refunded']
const actionStatuses = statuses.filter(status => !['Dispatched', 'Refunded'].includes(status))
const couriers = ['Royal Mail', 'Evri', 'DPD', 'DHL', 'UPS', 'FedEx', 'Other']

function money(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value || 0))
}

function addressLines(address) {
  if (!address) return ['Not supplied']
  return [address.line1, address.line2, address.city, address.region, address.postalCode, address.country || address.countryCode].filter(Boolean)
}

export function OrdersPage({ client = false }) {
  const account = getAccountFromPath()
  const isOwner = account?.role === 'owner'
  const canEdit = isOwner || account?.canEdit
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [providerFilter, setProviderFilter] = useState('All')
  const [notice, setNotice] = useState('Loading orders')
  const [tracking, setTracking] = useState({ courier: '', number: '', url: '' })
  const [refund, setRefund] = useState({ amount: '', reason: '', restoreStock: false })
  const selected = orders.find(order => order.id === selectedId) || orders[0]

  async function loadOrders(message = 'Orders synced') {
    try {
      const records = await api.getOrders()
      setOrders(records)
      setSelectedId(current => records.some(order => order.id === current) ? current : records[0]?.id || '')
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Orders unavailable')
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  useEffect(() => {
    setTracking({
      courier: selected?.tracking?.courier || '',
      number: selected?.tracking?.number || '',
      url: selected?.tracking?.url || '',
    })
    const remaining = Math.max(0, Number(selected?.total || 0) - Number(selected?.refund?.totalAmount || 0))
    setRefund({ amount: remaining ? remaining.toFixed(2) : '', reason: '', restoreStock: false })
  }, [selected?.id, selected?.tracking?.courier, selected?.tracking?.number, selected?.tracking?.url, selected?.total, selected?.refund?.totalAmount])

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter(order => {
      const matchesSearch = !term || `${order.orderNumber} ${order.customer?.name} ${order.customer?.email}`.toLowerCase().includes(term)
      const matchesStatus = statusFilter === 'All' || order.fulfilmentStatus === statusFilter
      const matchesProvider = providerFilter === 'All' || order.provider === providerFilter.toLowerCase()
      return matchesSearch && matchesStatus && matchesProvider
    })
  }, [orders, providerFilter, search, statusFilter])

  const livePaidOrders = orders.filter(order => ['Paid', 'Partially Refunded'].includes(order.paymentStatus) && !order.isTestOrder)
  const revenue = livePaidOrders.reduce(
    (total, order) => total + Math.max(0, Number(order.total || 0) - Number(order.refund?.totalAmount || 0)),
    0,
  )
  const awaiting = orders.filter(order => ['New', 'Processing', 'Awaiting Stock'].includes(order.fulfilmentStatus)).length
  const testOrders = orders.filter(order => order.isTestOrder).length

  async function updateStatus(status, extra = {}) {
    if (!selected || !canEdit) return
    setNotice('Updating order')
    try {
      const updated = await api.updateOrderStatus(selected.id, { status, ...extra })
      setOrders(current => current.map(order => (order.id === updated.id ? updated : order)))
      setNotice(`Order marked ${status}`)
    } catch (error) {
      setNotice(error.message || 'Update failed')
    }
  }

  async function dispatchOrder() {
    if (!selected || !canEdit) return
    if (!tracking.courier || !tracking.number.trim()) {
      setNotice('Courier and tracking number are required')
      return
    }
    await updateStatus('Dispatched', {
      tracking,
      sendDispatchEmail: selected.fulfilmentStatus === 'Dispatched',
    })
  }

  async function refundOrder() {
    if (!selected || !canEdit) return
    const amount = Number(refund.amount)
    const remaining = Math.max(0, Number(selected.total || 0) - Number(selected.refund?.totalAmount || 0))
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setNotice(`Refund must be between ${money(0.01, selected.currency)} and ${money(remaining, selected.currency)}`)
      return
    }
    if (!refund.reason.trim()) {
      setNotice('Refund reason is required')
      return
    }
    const fullRefund = Math.abs(amount - remaining) < 0.01
    if (refund.restoreStock && !fullRefund) {
      setNotice('Stock can only be restored with a full refund')
      return
    }
    const message = `${fullRefund ? 'Fully' : 'Partially'} refund ${money(amount, selected.currency)} for ${selected.orderNumber}? This sends a real ${selected.provider} refund and cannot be undone.`
    if (!window.confirm(message)) return

    setNotice('Processing refund')
    try {
      const result = await api.refundOrder(selected.id, {
        amount,
        fullRefund,
        reason: refund.reason.trim(),
        restoreStock: refund.restoreStock,
      })
      setOrders(current => current.map(order => (order.id === result.order.id ? result.order : order)))
      setNotice(`${money(amount, selected.currency)} refund processed`)
    } catch (error) {
      setNotice(error.message || 'Refund failed')
    }
  }

  function openInvoice() {
    if (!selected) return
    window.open(api.invoiceUrl(selected.id), '_blank', 'noopener,noreferrer')
  }

  async function purgeTests() {
    if (!isOwner || !testOrders) return
    if (!window.confirm(`Delete ${testOrders} test order${testOrders === 1 ? '' : 's'} and their test logs? Live orders will not be touched.`)) return
    setNotice('Removing test orders')
    try {
      const result = await api.purgeTestOrders()
      await loadOrders(`${result.removed} test order${result.removed === 1 ? '' : 's'} removed`)
    } catch (error) {
      setNotice(error.message || 'Test cleanup failed')
    }
  }

  const remainingRefund = selected
    ? Math.max(0, Number(selected.total || 0) - Number(selected.refund?.totalAmount || 0))
    : 0

  return (
    <Layout client={client} title="Orders">
      <section className="moduleHero card">
        <div>
          <span>Order Management</span>
          <h2>{client ? 'Your Store Orders' : 'All Client Orders'}</h2>
          <p>Review paid orders, invoices, fulfilment, tracking and verified payment refunds.</p>
        </div>
        <button onClick={() => loadOrders('Orders refreshed')}>{notice}</button>
      </section>

      <div className="stats">
        {[
          ['Orders', orders.length, 'Stored orders'],
          ['Revenue', money(revenue), 'Live total after refunds'],
          ['Awaiting', awaiting, 'Needs action'],
          ['Test Orders', testOrders, 'Safe to purge'],
        ].map(item => <div className="card stat" key={item[0]}><div><span>{item[0]}</span><strong>{item[1]}</strong><small>{item[2]}</small></div><i /></div>)}
      </div>

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel mainWork">
          <div className="mediaToolbar">
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, customer or email" />
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All</option>{statuses.map(status => <option key={status}>{status}</option>)}</select>
            <select value={providerFilter} onChange={event => setProviderFilter(event.target.value)}><option>All</option><option>Stripe</option><option>PayPal</option></select>
          </div>
          {visibleOrders.map(order => (
            <article className={order.id === selected?.id ? 'simplePageRow active' : 'simplePageRow'} key={order.id} onClick={() => setSelectedId(order.id)}>
              <div><b>{order.orderNumber}</b><small>{order.isTestOrder ? 'TEST · ' : ''}{order.customer?.name} · {order.customer?.email}</small></div>
              <span>{order.provider}</span>
              <span>{money(order.total, order.currency)}</span>
              <span>{order.paymentStatus}</span>
            </article>
          ))}
          {!visibleOrders.length && <p className="emptyState">No matching orders.</p>}
        </div>

        <aside className="card managerPanel nextSteps">
          <h2>Order Actions</h2>
          <button disabled={!selected} onClick={openInvoice}>Open Invoice</button>
          {actionStatuses.map(status => <button key={status} disabled={!selected || !canEdit || selected.fulfilmentStatus === status} onClick={() => updateStatus(status)}>{status}</button>)}
          {isOwner && <button disabled={!testOrders} onClick={purgeTests}>Delete Test Orders ({testOrders})</button>}
        </aside>
      </section>

      {selected && (
        <section className="simpleWebsiteGrid">
          <div className="card managerPanel">
            <div className="panelHead"><h2>{selected.orderNumber}</h2><span>{selected.isTestOrder ? 'TEST · ' : ''}{selected.paymentStatus} · {selected.fulfilmentStatus}</span></div>
            <h3>Customer</h3>
            <p>{selected.customer?.name}<br />{selected.customer?.email}<br />{selected.customer?.phone || 'No phone supplied'}</p>
            <h3>Delivery Address</h3>
            <p>{addressLines(selected.shippingAddress).map(line => <span key={line}>{line}<br /></span>)}</p>
            <h3>Items</h3>
            {selected.items?.map(item => <article className="simplePageRow" key={`${item.productId}-${item.variant?.size}-${item.variant?.colour}`}><div><b>{item.quantity} × {item.name}</b><small>{item.orderTag || item.sku || 'ITEM'} {item.variant?.size && `· Size: ${item.variant.size}`} {item.variant?.colour && `· Colour: ${item.variant.colour}`} {item.madeToOrder && '· Made to order'}</small></div><span>{money(item.total, selected.currency)}</span></article>)}
          </div>

          <div className="card managerPanel publishBox">
            <h2>Payment & Totals</h2>
            <button onClick={openInvoice}>Print / Save Invoice as PDF</button>
            <p>Environment: {selected.environment || (selected.isTestOrder ? 'test' : 'live')}</p>
            <p>Provider: {selected.provider}</p>
            <p>Provider order: {selected.providerOrderId}</p>
            <p>Transaction: {selected.providerTransactionId || 'Not supplied'}</p>
            <p>Subtotal: {money(selected.subtotal, selected.currency)}</p>
            <p>Shipping: {money(selected.shipping, selected.currency)}</p>
            <p>Tax: {money(selected.tax, selected.currency)}</p>
            <p>Discount: {money(selected.discount, selected.currency)}{selected.discountCode ? ` (${selected.discountCode})` : ''}</p>
            <p>Refunded: {money(selected.refund?.totalAmount, selected.currency)}</p>
            <h3>Total paid: {money(selected.total, selected.currency)}</h3>

            <h2>Refund</h2>
            <p>Available to refund: {money(remainingRefund, selected.currency)}</p>
            <label>Refund Amount<input type="number" min="0.01" max={remainingRefund} step="0.01" disabled={!canEdit || remainingRefund <= 0} value={refund.amount} onChange={event => setRefund(current => ({ ...current, amount: event.target.value }))} /></label>
            <label>Reason<textarea disabled={!canEdit || remainingRefund <= 0} value={refund.reason} onChange={event => setRefund(current => ({ ...current, reason: event.target.value }))} placeholder="Customer cancellation, returned item, damaged item..." /></label>
            <label className="formCheck"><input type="checkbox" checked={refund.restoreStock} disabled={!canEdit || remainingRefund <= 0} onChange={event => setRefund(current => ({ ...current, restoreStock: event.target.checked }))} /> Restore tracked stock after a full refund</label>
            <button disabled={!canEdit || remainingRefund <= 0} onClick={refundOrder}>Process Provider Refund</button>
            {selected.refund?.history?.map(entry => <p key={entry.id}><strong>{money(entry.amount, selected.currency)}</strong> · {entry.reason || 'No reason'} · {new Date(entry.createdAt).toLocaleString('en-GB')}{entry.restoredStock ? ' · Stock restored' : ''}</p>)}

            <h2>Notifications</h2>
            <p>Buyer email: {selected.notifications?.buyerEmail}</p>
            <p>Client email: {selected.notifications?.clientEmail}</p>
            <p>Discord: {selected.notifications?.discord}</p>
            <p>Dispatch email: {selected.notifications?.dispatchEmail || 'Not sent'}</p>
            <p>Refund email: {selected.notifications?.refundEmail || 'Not sent'}</p>
            <h2>Dispatch & Tracking</h2>
            <label>Courier<select disabled={!canEdit} value={tracking.courier} onChange={event => setTracking(current => ({ ...current, courier: event.target.value }))}><option value="">Choose courier</option>{couriers.map(courier => <option key={courier}>{courier}</option>)}</select></label>
            <label>Tracking Number<input disabled={!canEdit} value={tracking.number} onChange={event => setTracking(current => ({ ...current, number: event.target.value }))} /></label>
            <label>Custom Tracking URL<input type="url" disabled={!canEdit} value={tracking.url} onChange={event => setTracking(current => ({ ...current, url: event.target.value }))} placeholder="Generated automatically for supported couriers" /></label>
            {selected.tracking?.dispatchedAt && <p>Dispatched: {new Date(selected.tracking.dispatchedAt).toLocaleString('en-GB')}</p>}
            {selected.tracking?.url && <a href={selected.tracking.url} target="_blank" rel="noreferrer">Open tracking page</a>}
            {canEdit && <button onClick={dispatchOrder}>{selected.fulfilmentStatus === 'Dispatched' ? 'Save & Resend Dispatch Email' : 'Save & Mark Dispatched'}</button>}
          </div>
        </section>
      )}
    </Layout>
  )
}
