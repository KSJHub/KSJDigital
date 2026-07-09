import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

export function PublishPipelinePage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const [requests, setRequests] = useState([])
  const [history, setHistory] = useState([])
  const [notice, setNotice] = useState('Ready')

  const visibleRequests = useMemo(() => {
    if (!client) return requests
    return requests.filter(request => account?.websiteIds?.includes(request.websiteId))
  }, [account, client, requests])

  async function load() {
    try {
      const [nextRequests, nextHistory] = await Promise.all([
        api.getPublishRequests(),
        api.getPublishHistory(),
      ])
      setRequests(nextRequests)
      setHistory(nextHistory)
      setNotice('Connected')
    } catch (error) {
      setNotice(`API offline: ${error.message}`)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createRequest() {
    if (!website?.id) {
      setNotice('No website assigned')
      return
    }

    try {
      const request = await api.createPublishRequest({
        websiteId: website.id,
        websiteName: website.name,
        repository: website.repository,
        title: 'Website update request',
        createdBy: account?.name,
        contentPath: `server-data/content/${website.id}.json`,
      })
      setRequests([request, ...requests])
      setNotice('Update request created')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function approve(id) {
    try {
      await api.approvePublishRequest(id)
      await load()
      setNotice('Approved and ready for deployment')
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function reject(id) {
    try {
      await api.rejectPublishRequest(id, 'Rejected by KSJ Digital')
      await load()
      setNotice('Request rejected')
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <Layout client={client} title={client ? 'Updates' : 'Publishing'}>
      <section className="moduleHero card">
        <div>
          <span>{client ? 'Website Updates' : 'Publishing Pipeline'}</span>
          <h2>{client ? 'Request Website Update' : 'Review & Publish'}</h2>
          <p>
            {client
              ? 'Create a real update request for KSJ Digital review.'
              : 'Review client changes, approve them, and prepare deployment history.'}
          </p>
        </div>
        <button onClick={client ? createRequest : load}>{notice}</button>
      </section>
      <section className="publishFlow card">
        <h2>Workflow</h2>
        <div className="publishSteps">
          <span>1. Draft saved</span>
          <span>2. Request created</span>
          <span>3. KSJ review</span>
          <span>4. Approved</span>
          <span>5. Repository deployment</span>
          <span>6. Website live</span>
        </div>
      </section>
      <section className="publishGrid">
        <div className="card publishPanel">
          <div className="panelHead">
            <h2>{client ? 'My Requests' : 'Update Requests'}</h2>
            <button onClick={createRequest} disabled={!website?.id && client}>New Request</button>
          </div>
          {visibleRequests.length ? (
            visibleRequests.map(request => (
              <article className="publishRow" key={request.id}>
                <div>
                  <b>{request.title || 'Website update'}</b>
                  <small>
                    {request.websiteName || request.websiteId} · {request.createdBy || 'Client'} ·{' '}
                    {request.createdAt}
                  </small>
                </div>
                <span>{request.status}</span>
                {!client && (
                  <div className="publishActions">
                    <button onClick={() => approve(request.id)}>Approve</button>
                    <button onClick={() => reject(request.id)}>Reject</button>
                  </div>
                )}
              </article>
            ))
          ) : (
            <p>No publish requests yet.</p>
          )}
        </div>
        <aside className="card publishPanel">
          <div className="panelHead">
            <h2>Deploy History</h2>
            <button>Live</button>
          </div>
          {history.length ? (
            history.map(item => (
              <article className="publishHistoryRow" key={item.id}>
                <b>{item.websiteId}</b>
                <small>{item.status}</small>
                <span>{item.approvedAt}</span>
              </article>
            ))
          ) : (
            <p>No deployments yet.</p>
          )}
        </aside>
      </section>
    </Layout>
  )
}
