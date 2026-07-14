import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

function displayDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB')
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return 'Empty'
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function friendlyPath(path = '') {
  return path
    .replace(/\.(\d+)\./g, ' #$1 · ')
    .replace(/\./g, ' · ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, value => value.toUpperCase())
}

function imageValue(value) {
  if (typeof value !== 'string') return false
  return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(value) || value.startsWith('/assets/')
}

function ChangeValue({ value, label }) {
  return (
    <section>
      <span>{label}</span>
      {imageValue(value) ? <><img className="approvalImagePreview" src={value} alt="Changed asset preview" /><pre>{value}</pre></> : <pre>{displayValue(value)}</pre>}
    </section>
  )
}

export function PublishPipelinePage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const canRequestUpdates = account?.role === 'owner' || account?.canRequestUpdates
  const [requests, setRequests] = useState([])
  const [history, setHistory] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [review, setReview] = useState(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [notice, setNotice] = useState(client && !canRequestUpdates ? 'Request permission required' : 'Ready')

  const visibleRequests = useMemo(() => {
    const scoped = client ? requests.filter(request => account?.websiteIds?.includes(request.websiteId)) : requests
    return scoped.filter(request => request.status !== 'Superseded')
  }, [account?.websiteIds, client, requests])

  const selectedRequest = visibleRequests.find(request => request.id === selectedId) || null

  async function load(preferredId = '') {
    try {
      const [nextRequests, nextHistory] = await Promise.all([api.getPublishRequests(), api.getPublishHistory()])
      setRequests(nextRequests)
      setHistory(nextHistory)
      if (!client) {
        const available = nextRequests.filter(request => request.status !== 'Superseded')
        const preferred = available.find(request => request.id === (preferredId || selectedId))
        const waiting = available.find(request => request.status === 'Waiting Review')
        const next = preferred || waiting || available[0]
        setSelectedId(next?.id || '')
      }
      setNotice(client && !canRequestUpdates ? 'Read-only access' : 'Connected')
    } catch (error) {
      setNotice(`API offline: ${error.message}`)
    }
  }

  useEffect(() => { load() }, [canRequestUpdates, client])

  useEffect(() => {
    if (client || !selectedId) {
      setReview(null)
      setReviewError('')
      return
    }
    let cancelled = false
    setReviewLoading(true)
    setReview(null)
    setReviewError('')
    api.getPublishRequestReview(selectedId)
      .then(data => {
        if (!cancelled) {
          setReview(data)
          setRejectionReason('')
        }
      })
      .catch(error => {
        if (!cancelled) {
          setReviewError(error.message || 'Review could not be loaded')
          setNotice('Review unavailable')
        }
      })
      .finally(() => !cancelled && setReviewLoading(false))
    return () => { cancelled = true }
  }, [client, selectedId])

  async function createRequest() {
    if (!canRequestUpdates) return setNotice('Publish request permission required')
    if (!website?.id) return setNotice('No website assigned')
    try {
      const request = await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Website update request',
        createdBy: account?.displayName || account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setRequests(current => [request, ...current])
      setNotice(request.duplicate ? 'This exact draft is already waiting for review' : 'Update request created with a frozen draft snapshot')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function approve(id) {
    if (!window.confirm('Publish this exact reviewed snapshot to the live website?')) return
    setDecisionBusy(true)
    try {
      const result = await api.approvePublishRequest(id)
      await load()
      setReview(null)
      setNotice(`${result.version || 'New version'} published successfully`)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setDecisionBusy(false)
    }
  }

  async function reject(id) {
    const reason = rejectionReason.trim()
    if (!reason) return setNotice('Add a rejection reason before returning this update')
    setDecisionBusy(true)
    try {
      await api.rejectPublishRequest(id, reason)
      await load()
      setReview(null)
      setNotice('Request returned to the client')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setDecisionBusy(false)
    }
  }

  return (
    <Layout client={client} title={client ? 'Updates' : 'Approvals'}>
      <section className="moduleHero card">
        <div>
          <span>{client ? 'Website Updates' : 'Owner Approval Centre'}</span>
          <h2>{client ? 'Submit and Track Changes' : 'Review Before Publishing'}</h2>
          <p>{client ? 'Submitted updates are frozen for KSJ Digital review. Later edits remain in your next draft.' : 'Compare the currently published website with the exact submitted snapshot before approving it.'}</p>
        </div>
        <button onClick={client && canRequestUpdates ? createRequest : () => load()}>{notice}</button>
      </section>

      {client ? (
        <section className="publishGrid">
          <div className="card publishPanel">
            <div className="panelHead"><h2>My Requests</h2>{canRequestUpdates && <button onClick={createRequest} disabled={!website?.id}>Submit Current Draft</button>}</div>
            {visibleRequests.length ? visibleRequests.map(request => <article className="publishRow" key={request.id}><div><b>{request.title || 'Website update'}</b><small>{request.websiteName || request.websiteId} · Submitted {displayDate(request.createdAt)}</small></div><span>{request.status}</span></article>) : <p>No update requests yet.</p>}
          </div>
          <aside className="card publishPanel">
            <div className="panelHead"><h2>Published Updates</h2><span>{history.length}</span></div>
            {history.length ? history.map(item => <article className="publishHistoryRow" key={item.id}><b>{item.version || item.websiteId}</b><small>{item.title || item.action || item.status}</small><span>{displayDate(item.publishedAt || item.createdAt)}</span></article>) : <p>No published updates yet.</p>}
          </aside>
        </section>
      ) : (
        <section className="approvalWorkspace">
          <aside className="card approvalQueue">
            <div className="panelHead"><h2>Approval Queue</h2><span>{visibleRequests.filter(item => item.status === 'Waiting Review').length} waiting</span></div>
            {visibleRequests.length ? visibleRequests.map(request => (
              <button className={request.id === selectedId ? 'active' : ''} key={request.id} onClick={() => setSelectedId(request.id)}>
                <span className={`requestStatus ${request.status.toLowerCase().replace(/\s+/g, '-')}`}>{request.status}</span>
                <b>{request.websiteName || request.websiteId}</b>
                <strong>{request.title || 'Website update'}</strong>
                <small>{request.createdBy || 'Client'} · {displayDate(request.createdAt)}</small>
              </button>
            )) : <p>No publish requests yet.</p>}
          </aside>

          <main className="card approvalReview">
            {reviewLoading ? (
              <p className="emptyState">Loading submitted snapshot…</p>
            ) : reviewError ? (
              <section className="approvalReviewError"><strong>Review could not be loaded</strong><p>{reviewError}</p><button onClick={() => setSelectedId(current => { setTimeout(() => setSelectedId(current), 0); return '' })}>Retry Review</button></section>
            ) : selectedRequest && review ? (
              <>
                <div className="approvalReviewHead">
                  <div><span>{selectedRequest.websiteName || selectedRequest.websiteId}</span><h2>{selectedRequest.title || 'Website update'}</h2><p>Submitted by {selectedRequest.createdBy || 'Client'} on {displayDate(selectedRequest.createdAt)}</p></div>
                  <span className={`requestStatus ${selectedRequest.status.toLowerCase().replace(/\s+/g, '-')}`}>{selectedRequest.status}</span>
                </div>

                {review.warning && <div className="approvalRecoveryWarning"><strong>Recovered legacy request</strong><p>{review.warning}</p></div>}

                <div className="approvalStats">
                  <article><b>{review.totals?.changedFields || 0}</b><span>Fields changed</span></article>
                  <article><b>{review.totals?.changedSections || 0}</b><span>Areas affected</span></article>
                  <article><b>{displayDate(selectedRequest.snapshotUpdatedAt)}</b><span>Frozen draft time</span></article>
                </div>

                <section className="changeSummary"><h3>Changed Areas</h3><div>{review.summary?.length ? review.summary.map(item => <span key={item.section}>{friendlyPath(item.section)} · {item.count}</span>) : <span>No content differences</span>}</div></section>

                <section className="changeList">
                  <div className="changeListHead"><h3>Before and After</h3><span>{review.changes?.length || 0} changes</span></div>
                  {review.changes?.length ? review.changes.map(change => <article className="changeCard" key={change.path}><h4>{friendlyPath(change.path)}</h4><div className="changeColumns"><ChangeValue label="Currently Live" value={change.before} /><ChangeValue label="Submitted Draft" value={change.after} /></div></article>) : <p className="emptyState">The submitted snapshot matches the currently published website.</p>}
                </section>

                {selectedRequest.status === 'Waiting Review' && (
                  <section className="approvalDecision">
                    <label>Reason when returning changes<textarea value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder="Explain what the client needs to adjust before resubmitting." /></label>
                    <div><button className="danger" disabled={decisionBusy} onClick={() => reject(selectedRequest.id)}>{decisionBusy ? 'Working…' : 'Return Changes'}</button><button disabled={decisionBusy || !review.changes?.length} onClick={() => approve(selectedRequest.id)}>{decisionBusy ? 'Publishing…' : 'Approve Exact Snapshot'}</button></div>
                  </section>
                )}
              </>
            ) : <p className="emptyState">Select an update request to review it.</p>}
          </main>

          <aside className="card approvalHistory">
            <div className="panelHead"><h2>Publish History</h2><span>{history.length}</span></div>
            {history.length ? history.slice(0, 12).map(item => <article key={item.id}><b>{item.version || item.websiteName || item.websiteId}</b><span>{item.title || item.action || item.status || 'Published'}</span><small>{item.changedFields ?? 0} changes · {displayDate(item.publishedAt || item.createdAt)}</small></article>) : <p>No deployments yet.</p>}
          </aside>
        </section>
      )}
    </Layout>
  )
}
