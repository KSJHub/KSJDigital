import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'

function getReleaseState() {
  return {
    version: '0.3.0',
    status: 'In Progress',
    lastCheck: new Date().toLocaleString(),
    checks: [
      ['Portal Navigation', 'Ready', 'Owner and client workspaces routed'],
      ['Client Access', 'In Progress', 'Server sessions active; route middleware hardening next'],
      ['Brand Centre', 'Ready', 'Brand assets now use the API asset store'],
      ['Page Builder', 'Ready', 'Pages and blocks save through content API'],
      ['CMS Engine', 'Ready', 'Navigation, theme, globals, SEO and config save through content API'],
      ['Media Library', 'Ready', 'Uploads and asset listing now use the API asset store'],
      ['Form Builder', 'Ready', 'Forms and fields now use server-data through API'],
      ['Publishing', 'In Progress', 'Request, review and history workflow active; GitHub deployment next'],
      ['Operations', 'In Progress', 'Browser backups removed; server backup module next'],
      ['API Server', 'Ready', 'Node API and server-data storage active'],
    ],
  }
}

function getCompletionSummary(state) {
  const ready = state.checks.filter(item => item[1] === 'Ready').length
  const total = state.checks.length

  return {
    ready,
    total,
    percent: Math.round((ready / total) * 100),
  }
}

export function ReleaseCentrePage({ client = false }) {
  const [state, setState] = useState(getReleaseState())
  const summary = getCompletionSummary(state)

  function checkNow() {
    setState(getReleaseState())
  }

  return (
    <Layout client={client} title="Launch Centre">
      <section className="moduleHero card">
        <div>
          <span>Launch Centre</span>
          <h2>KSJ Digital v{state.version}</h2>
          <p>
            Final readiness overview for the portal, CMS, brand tools, media library, forms,
            publishing and operations.
          </p>
        </div>
        <button onClick={checkNow}>{state.status}</button>
      </section>
      <section className="releaseGrid">
        <section className="card releaseScore">
          <span>Completion</span>
          <strong>{summary.percent}%</strong>
          <small>
            {summary.ready} of {summary.total} systems ready
          </small>
          {state.lastCheck && <p>Last checked: {state.lastCheck}</p>}
        </section>
        <section className="card releasePanel">
          <div className="panelHead">
            <h2>System Checklist</h2>
            <button onClick={checkNow}>Run Check</button>
          </div>
          {state.checks.map(item => (
            <article className="releaseRow" key={item[0]}>
              <div>
                <b>{item[0]}</b>
                <small>{item[2]}</small>
              </div>
              <span>{item[1]}</span>
            </article>
          ))}
        </section>
        <aside className="card releasePanel">
          <h2>Next Real-World Setup</h2>
          <p>
            The platform is ready as a working local portal. Final live deployment needs your real
            hosting credentials and repository secrets.
          </p>
          <div className="launchNeeds">
            <span>Live domain</span>
            <span>Server credentials</span>
            <span>Repository secrets</span>
            <span>Mail service keys</span>
            <span>Cloud storage account</span>
            <span>Database connection</span>
          </div>
        </aside>
      </section>
    </Layout>
  )
}
