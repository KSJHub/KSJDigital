import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const statuses = ['New', 'Processing', 'Awaiting Stock', 'Dispatched', 'Delivered', 'Cancelled', 'Refunded']

function money(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(value || 0))
}

function addressLines(address) {
  if (!address) return ['Not supplied']
  return [address.line1, address.line2, address.city, address.region, address.postalCode, address.country || address.countryCode].filter(Boolean)
}

export function OrdersPage({ client = false }) {
  const account = getAccountFromPath()
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [providerFilter, setProviderFilter] = useState('All')
  const [notice, setNotice] = useState('Loading orders')
  const selected = orders.find(order => order.id === selectedId) || orders[0]

  async function loadOrders(message = 'Orders synced') {
    try {
      const records = await api.getOrders()
      setOrders(records)
      setSelectedId(current => current || records[0]?.id || '')
      setNotice(message)
    } catch (error) {
      setNotice(error.message || 'Orders unavailable')
    }
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter(order => {
      const matchesSearch = !term || `${order.orderNumber} ${order.customer?.name} ${order.customer?.email}`.toLowerCase().includes(term)
      const matchesStatus = statusFilter === 'All' || order.fulfilmentStatus === statusFilter
      const matchesProvider = providerFilter === 'All' || order.provider === providerFilter.toLowerCase()
      return matchesSearch && matchesStatus && matchesProvider
    })
  }, [orders, providerFilter, search, statusFilter])

  const paidOrders = orders.filter(order => order.paymentStatus === 'Paid')
  const revenue = paidOrders.reduce((total, order) => total + Number(order.total || 0), 0)
  const awaiting = orders.filter(order => ['New', 'Processing', 'Awaiting Stock'].includes(order.fulfilmentStatus)).length
  const dispatched = orders.filter(order => order.fulfilmentStatus === 'Dispatched').length

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

  return (
    <Layout client={client} title="Orders">
      <section className="moduleHero card">
        <div>
          <span>Order Management</span>
          <h2>{client ? 'Your Store Orders' : 'All Client Orders'}</h2>
          <p>Review paid orders, customer delivery details, notification status and fulfilment progress.</p>
        </div>
        <button onClick={() => loadOrders('Orders refreshed')}>{notice}</button>
      </section>

      <div className="stats">
        {[
          ['Orders', orders.length, 'Stored orders'],
          ['Revenue', money(revenue), 'Paid total'],
          ['Awaiting', awaiting, 'Needs action'],
          ['Dispatched', dispatched, 'In delivery'],
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
              <div><b>{order.orderNumber}</b><small>{order.customer?.name} · {order.customer?.email}</small></div>
              <span>{order.provider}</span>
              <span>{money(order.total, order.currency)}</span>
              <span>{order.fulfilmentStatus}</span>
            </article>
          ))}
          {!visibleOrders.length && <p className="emptyState">No matching orders.</p>}
        </div>

        <aside className="card managerPanel nextSteps">
          <h2>Order Actions</h2>
          {statuses.map(status => <button key={status} disabled={!selected || !canEdit || selected.fulfilmentStatus === status} onClick={() => updateStatus(status)}>{status}</button>)}
        </aside>
      </section>

      {selected && (
        <section className="simpleWebsiteGrid">
          <div className="card managerPanel">
            <div className="panelHead"><h2>{selected.orderNumber}</h2><span>{selected.paymentStatus} · {selected.fulfilmentStatus}</span></div>
            <h3>Customer</h3>
            <p>{selected.customer?.name}<br />{selected.customer?.email}<br />{selected.customer?.phone || 'No phone supplied'}</p>
            <h3>Delivery Address</h3>
            <p>{addressLines(selected.shippingAddress).map(line => <span key={line}>{line}<br /></span>)}</p>
            <h3>Items</h3>
            {selected.items?.map(item => <article className="simplePageRow" key={`${item.productId}-${item.variant?.size}-${item.variant?.colour}`}><div><b>{item.quantity} × {item.name}</b><small>{item.variant?.size && `Size: ${item.variant.size}`} {item.variant?.colour && `· Colour: ${item.variant.colour}`}</small></div><span>{money(item.total, selected.currency)}</span></article>)}
          </div>

          <div className="card managerPanel publishBox">
            <h2>Payment & Totals</h2>
            <p>Provider: {selected.provider}</p>
            <p>Provider order: {selected.providerOrderId}</p>
            <p>Transaction: {selected.providerTransactionId || 'Not supplied'}</p>
            <p>Subtotal: {money(selected.subtotal, selected.currency)}</p>
            <p>Shipping: {money(selected.shipping, selected.currency)}</p>
            <p>Tax: {money(selected.tax, selected.currency)}</p>
            <p>Discount: {money(selected.discount, selected.currency)}</p>
            <h3>Total: {money(selected.total, selected.currency)}</h3>
            <h2>Notifications</h2>
            <p>Buyer email: {selected.notifications?.buyerEmail}</p>
            <p>Client email: {selected.notifications?.clientEmail}</p>
            <p>Discord: {selected.notifications?.discord}</p>
            <h2>Tracking</h2>
            <label>Courier<input disabled={!canEdit} defaultValue={selected.tracking?.courier || ''} id="order-courier" /></label>
            <label>Tracking Number<input disabled={!canEdit} defaultValue={selected.tracking?.number || ''} id="order-tracking" /></label>
            {canEdit && <button onClick={() => updateStatus('Dispatched', { tracking: { courier: document.getElementById('order-courier')?.value || '', number: document.getElementById('order-tracking')?.value || '' } })}>Save & Mark Dispatched</button>}
          </div>
        </section>
      )}
    </Layout>
  )
}
