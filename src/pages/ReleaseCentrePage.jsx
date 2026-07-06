import { useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { getCompletionSummary, getReleaseState, runReleaseCheck } from '../services/releaseCentre.js'

export function ReleaseCentrePage({ client = false }) {
  const [state, setState] = useState(getReleaseState())
  const summary = getCompletionSummary()

  function checkNow() {
    setState(runReleaseCheck())
  }

  return <Layout client={client} title="Launch Centre"><section className="moduleHero card"><div><span>Launch Centre</span><h2>KSJ Digital v{state.version}</h2><p>Final readiness overview for the portal, CMS, brand tools, media library, forms, publishing and operations.</p></div><button onClick={checkNow}>{state.status}</button></section><section className="releaseGrid"><section className="card releaseScore"><span>Completion</span><strong>{summary.percent}%</strong><small>{summary.ready} of {summary.total} systems ready</small>{state.lastCheck && <p>Last checked: {state.lastCheck}</p>}</section><section className="card releasePanel"><div className="panelHead"><h2>System Checklist</h2><button onClick={checkNow}>Run Check</button></div>{state.checks.map(item => <article className="releaseRow" key={item[0]}><div><b>{item[0]}</b><small>{item[2]}</small></div><span>{item[1]}</span></article>)}</section><aside className="card releasePanel"><h2>Next Real-World Setup</h2><p>The platform is ready as a working local portal. Final live deployment needs your real hosting credentials and repository secrets.</p><div className="launchNeeds"><span>Live domain</span><span>Server credentials</span><span>Repository secrets</span><span>Mail service keys</span><span>Cloud storage account</span><span>Database connection</span></div></aside></section></Layout>
}
