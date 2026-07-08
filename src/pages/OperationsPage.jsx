import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getPages } from '../services/pageBuilder.js'
import { buildSiteExport, getSiteConfig } from '../services/siteEngine.js'
import {
  createBackup,
  getAuditEvents,
  getBackups,
  getProductionChecklist,
  restoreBackup,
} from '../services/auditBackup.js'
import { getClientWebsite } from '../services/platform.js'

function sizeLabel(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function OperationsPage({ client = false }) {
  const website = getClientWebsite()
  const [backups, setBackups] = useState(getBackups(website.id))
  const [audit, setAudit] = useState(getAuditEvents(website.id))
  const [notice, setNotice] = useState('Ready')
  const checklist = getProductionChecklist()

  function refresh(message = 'Updated') {
    setBackups(getBackups(website.id))
    setAudit(getAuditEvents(website.id))
    setNotice(message)
  }

  function backupNow() {
    const data = buildSiteExport(website, getPages(website.id), getSiteConfig(website.id))
    createBackup(website.id, data)
    refresh('Backup created')
  }

  function restore(id) {
    restoreBackup(website.id, id)
    refresh('Restore logged')
  }

  return (
    <Layout client={client} title="Operations">
      <section className="moduleHero card">
        <div>
          <span>Operations</span>
          <h2>{website.name} Control</h2>
          <p>Review readiness, create backups, and track portal activity before publishing.</p>
        </div>
        <button>{notice}</button>
      </section>
      <section className="productionGrid">
        <section className="card productionPanel">
          <div className="panelHead">
            <h2>Readiness</h2>
            <button>98%</button>
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
          {backups.length ? (
            backups.map(item => (
              <article className="backupRow" key={item.id}>
                <div>
                  <b>{item.createdAt}</b>
                  <small>
                    {item.status} · {sizeLabel(item.size)}
                  </small>
                </div>
                <button onClick={() => restore(item.id)}>Restore</button>
              </article>
            ))
          ) : (
            <p>No backups yet.</p>
          )}
        </section>
        <section className="card productionPanel wide">
          <div className="panelHead">
            <h2>Audit Log</h2>
            <button>Recent</button>
          </div>
          {audit.length ? (
            audit.map(item => (
              <article className="auditRow" key={item.id}>
                <b>{item.type}</b>
                <span>{item.message}</span>
                <small>
                  {item.actor} · {item.createdAt}
                </small>
              </article>
            ))
          ) : (
            <p>No audit events yet.</p>
          )}
        </section>
        <aside className="card productionPanel">
          <h2>Go Live Checklist</h2>
          <div className="deployRequirements">
            <span>Repository connected</span>
            <span>Build workflow ready</span>
            <span>Release path set</span>
            <span>Domain active</span>
            <span>Backup available</span>
            <span>Rollback ready</span>
          </div>
          <p>When ready, approved updates can be exported and passed into the publish workflow.</p>
        </aside>
      </section>
    </Layout>
  )
}
