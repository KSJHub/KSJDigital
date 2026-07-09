import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'

const checklist = [
  ['Authentication', 'Server session endpoints active', 'Harden every API route with middleware'],
  ['Storage', 'Server filesystem storage active', 'Cloud storage recommended for production'],
  ['Publishing', 'Approval workflow ready', 'Repository token required for live deployment'],
  ['Backups', 'Backup module pending API migration', 'Server-side restore points next'],
  ['Audit Logs', 'Activity logging pending API migration', 'Server-side immutable logs next'],
  ['Monitoring', 'Health endpoint ready', 'Uptime monitoring next'],
]

export function OperationsPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const [notice, setNotice] = useState('Ready')

  function backupNow() {
    setNotice('Backup API pending')
  }

  return (
    <Layout client={client} title="Operations">
      <section className="moduleHero card">
        <div>
          <span>Operations</span>
          <h2>{website?.name || 'Assigned Website'} Control</h2>
          <p>Review readiness, backup requirements, and portal activity before publishing.</p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="productionGrid">
        <section className="card productionPanel">
          <div className="panelHead">
            <h2>Readiness</h2>
            <button>API-first</button>
          </div>
          {checklist.map(item => (
            <article className="checkRow" key={item[0]}>
              <div>
                <b>{item[0]}</b>
                <small>{item[1]}</small>
              </div>
              <span>{item[2]}</span>
            </article>
          ))}
        </section>
        <section className="card productionPanel">
          <div className="panelHead">
            <h2>Backups</h2>
            <button onClick={backupNow}>Create Backup</button>
          </div>
          <p>Backup storage has been removed from the browser. Server-side restore points are next.</p>
        </section>
        <section className="card productionPanel wide">
          <div className="panelHead">
            <h2>Audit Log</h2>
            <button>Pending API</button>
          </div>
          <p>Activity logging will be stored in server-data once the Activity Logs module is migrated.</p>
        </section>
        <aside className="card productionPanel">
          <h2>Go Live Checklist</h2>
          <div className="deployRequirements">
            <span>Repository connected</span>
            <span>Build workflow ready</span>
            <span>Release path set</span>
            <span>Domain active</span>
            <span>Server backups planned</span>
            <span>Rollback planned</span>
          </div>
          <p>When ready, approved updates can be exported and passed into the publish workflow.</p>
        </aside>
      </section>
    </Layout>
  )
}
