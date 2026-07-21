import { useEffect, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const EMPTY_INVENTORY = { summary: {}, stock: [], alerts: [], movements: [] }

function movementLabel(value) {
  const quantity = Number(value || 0)
  return quantity > 0 ? `+${quantity}` : String(quantity)
}

export function InventoryPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const assignedWebsite = findClientWebsite(websites, account)
  const availableWebsites = client
    ? websites.filter(site => account?.websiteIds?.includes(site.id))
    : websites
  const [websiteId, setWebsiteId] = useState(assignedWebsite?.id || availableWebsites[0]?.id || '')
  const [inventory, setInventory] = useState(EMPTY_INVENTORY)
  const [notice, setNotice] = useState('Loading inventory')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!websiteId) {
      setNotice('No website assigned')
      setInventory(EMPTY_INVENTORY)
      return
    }

    let cancelled = false
    setNotice('Loading inventory')

    api.getInventory(websiteId)
      .then(nextInventory => {
        if (cancelled) return
        setInventory(nextInventory || EMPTY_INVENTORY)
        setNotice('Inventory synced')
      })
      .catch(error => {
        if (!cancelled) setNotice(error.message || 'Inventory unavailable')
      })

    return () => { cancelled = true }
  }, [refreshKey, websiteId])

  const selectedWebsite = websites.find(site => site.id === websiteId)
  const summary = inventory.summary || {}
  const alerts = inventory.alerts || []
  const stock = inventory.stock || []
  const movements = inventory.movements || []
  const stats = [
    ['Tracked Products', summary.trackedProducts || 0, 'Products using ready stock'],
    ['Ready Units', summary.readyUnits || 0, 'Total tracked units'],
    ['Low Stock', summary.lowStock || 0, 'At or below warning level'],
    ['Out of Stock', summary.outOfStock || 0, 'No ready stock remaining'],
  ]

  return (
    <Layout client={client} title="Inventory">
      <section className="moduleHero card">
        <div>
          <span>Inventory Control</span>
          <h2>{selectedWebsite?.name || 'Website'} Stock Health</h2>
          <p>Review ready stock, low-stock warnings and order-linked inventory movements.</p>
        </div>
        <button onClick={() => setRefreshKey(current => current + 1)}>{notice}</button>
      </section>

      {!client && availableWebsites.length > 1 && (
        <section className="card formSettings">
          <label>
            Website
            <select value={websiteId} onChange={event => setWebsiteId(event.target.value)}>
              {availableWebsites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
        </section>
      )}

      <div className="stats">
        {stats.map(([label, value, description]) => (
          <div className="card stat" key={label}>
            <div><span>{label}</span><strong>{value}</strong><small>{description}</small></div>
            <i />
          </div>
        ))}
      </div>

      <section className="simpleWebsiteGrid">
        <div className="card managerPanel mainWork">
          <div className="panelHead"><h2>Stock Alerts</h2><span>{alerts.length} need attention</span></div>
          {alerts.map(item => (
            <article className="simplePageRow" key={`${item.productId}-${item.variantLabel}`}>
              <div>
                <b>{item.productName}</b>
                <small>{item.orderTag} · {item.variantLabel}{item.madeToOrder ? ' · Made to order remains available' : ''}</small>
              </div>
              <span>{item.quantity} ready</span>
              <span>Warn at {item.threshold}</span>
              <span>{item.status}</span>
            </article>
          ))}
          {!alerts.length && <p className="emptyState">No low-stock or out-of-stock alerts.</p>}
        </div>

        <aside className="card managerPanel nextSteps">
          <h2>Stock Guidance</h2>
          <p>Update quantities and variant warning levels from the Merch Manager.</p>
          <button onClick={() => { location.href = client ? '/client/merch' : '/owner/merch' }}>Open Merch Manager</button>
          <p>Made-to-order products can continue accepting orders at zero ready stock while still appearing here for production planning.</p>
        </aside>
      </section>

      <section className="card managerPanel">
        <div className="panelHead"><h2>All Tracked Stock</h2><span>{stock.length} stock lines</span></div>
        {stock.map(item => (
          <article className="simplePageRow" key={`${item.productId}-${item.variantLabel}`}>
            <div><b>{item.productName}</b><small>{item.orderTag} · {item.variantLabel}</small></div>
            <span>{item.quantity} ready</span>
            <span>Warning: {item.threshold}</span>
            <span>{item.status}</span>
          </article>
        ))}
        {!stock.length && <p className="emptyState">No products currently track ready stock.</p>}
      </section>

      <section className="card managerPanel">
        <div className="panelHead"><h2>Inventory History</h2><span>Latest 100 order-linked movements</span></div>
        {movements.map(item => (
          <article className="simplePageRow" key={item.id}>
            <div><b>{item.productName}</b><small>{item.orderNumber} · {item.variantLabel} · {item.reason}</small></div>
            <span>{movementLabel(item.quantityChange)}</span>
            <span>{new Date(item.createdAt).toLocaleString('en-GB')}</span>
          </article>
        ))}
        {!movements.length && <p className="emptyState">Inventory movements will appear after tracked products are purchased or restored through a refund.</p>}
      </section>
    </Layout>
  )
}
