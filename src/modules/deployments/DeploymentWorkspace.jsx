import { Layout } from '../../layouts/Shell.jsx'
import { deploymentLogs, deploymentSteps, deploymentTargets } from '../../services/deployments.js'

const deploymentStats = [
  ['Live Sites', '1', 'currently live'],
  ['Pending Builds', '1', 'waiting for approval'],
  ['Healthy Targets', '2', 'no current issues'],
  ['Last Deploy', '3 days ago', 'TwoToneTaj'],
]

export function DeploymentWorkspace() {
  return <Layout title="Deployments"><section className="deploymentHero card"><div><span>Owner Deployment Control</span><h2>Website Deployment Centre</h2><p>Track approved website updates from publish request through build, VPS update and live verification.</p></div><button>Run Deployment</button></section><div className="deploymentStats">{deploymentStats.map(card => <article className="card deploymentStat" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small>{card[2]}</small></article>)}</div><section className="deploymentGrid"><div className="card deploymentPanel wide"><div className="panelHead"><h2>Deployment Targets</h2><button>Add Target</button></div>{deploymentTargets.map(target => <article className="targetRow" key={target.id}><div><b>{target.website}</b><small>{target.domain} · {target.environment} · {target.branch}</small></div><span>{target.status}</span><em>{target.health}</em><button>Open</button></article>)}</div><div className="card deploymentPanel"><div className="panelHead"><h2>Deployment Steps</h2><button>Settings</button></div>{deploymentSteps.map((step, index) => <article className="deployStep" key={step[0]}><b>0{index + 1}</b><div><strong>{step[0]}</strong><small>{step[1]}</small></div></article>)}</div></section><section className="deploymentGrid"><div className="card deploymentPanel"><div className="panelHead"><h2>Current Build</h2><button>View Build</button></div><div className="buildStatus"><strong>TwoToneTaj</strong><span>Production Live</span><p>Last approved content update has been published and verified.</p><div className="buildProgress"><i style={{width:'100%'}}></i></div></div></div><div className="card deploymentPanel wide"><div className="panelHead"><h2>Deployment History</h2><button>Open Logs</button></div>{deploymentLogs.map(row => <article className="deploymentLog" key={`${row[0]}-${row[1]}`}><div><b>{row[1]}</b><small>{row[0]} · {row[3]}</small></div><span>{row[2]}</span></article>)}</div></section></Layout>
}
