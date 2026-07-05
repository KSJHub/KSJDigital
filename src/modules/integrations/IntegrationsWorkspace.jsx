import { Layout } from '../../layouts/Shell.jsx'
import { contentTargets, githubConnections, integrationChecks, integrationFlow } from '../../services/integrations.js'

const stats = [
  ['Connected Websites', '1', 'TwoToneTaj active'],
  ['Content Targets', '4', 'safe JSON mappings'],
  ['Approval Rules', 'Ready', 'owner controlled'],
  ['Deploy Handoff', 'Planned', 'next build stage'],
]

export function IntegrationsWorkspace() {
  return <Layout title="Integrations"><section className="integrationHero card"><div><span>Owner Integration Control</span><h2>Website Connections</h2><p>Connect KSJ Digital to client websites so portal edits can become safe content updates and approved deployments.</p></div><button>Add Integration</button></section><div className="integrationStats">{stats.map(card => <article className="card integrationStat" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small>{card[2]}</small></article>)}</div><section className="integrationGrid"><div className="card integrationPanel wide"><div className="panelHead"><h2>Connected Website Repositories</h2><button>Refresh</button></div>{githubConnections.map(connection => <article className="connectionRow" key={connection.id}><div><b>{connection.website}</b><small>{connection.repository} · {connection.branch}</small></div><span>{connection.status}</span><em>{connection.access}</em><button>Manage</button></article>)}</div><div className="card integrationPanel"><div className="panelHead"><h2>Connection Checks</h2><button>Run Checks</button></div>{integrationChecks.map(check => <article className="integrationCheck" key={check[0]}><b>{check[0]}</b><span>{check[1]}</span></article>)}</div></section><section className="integrationGrid"><div className="card integrationPanel"><div className="panelHead"><h2>TwoToneTaj Content Targets</h2><button>Edit Mapping</button></div>{contentTargets.map(target => <article className="targetMap" key={target[0]}><b>{target[0]}</b><small>{target[1]}</small><p>{target[2]}</p></article>)}</div><div className="card integrationPanel wide"><div className="panelHead"><h2>How KSJ Digital Works With Websites</h2><button>View Plan</button></div><div className="integrationFlow">{integrationFlow.map((step, index) => <article key={step[0]}><b>0{index + 1}</b><div><strong>{step[0]}</strong><small>{step[1]}</small></div></article>)}</div></div></section></Layout>
}
