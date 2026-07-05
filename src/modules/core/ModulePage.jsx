import { AnalyticsPanel, TicketPanel, StatusPanel } from '../../components/Panels.jsx'
import { Layout } from '../../layouts/Shell.jsx'

const fallbackModules = {
  websites: ['Website overview','Domain and SSL','Publishing workflow','SEO and speed scores'],
  clients: ['Client profile','Assigned websites','Access permissions','Account notes'],
  analytics: ['Traffic overview','Visitor devices','Top pages','Performance trends'],
}

export function ModulePage({ client = false, type = 'websites' }) {
  const list = fallbackModules[type] || ['Overview','Workflow','Insights','Actions']
  const title = type[0].toUpperCase() + type.slice(1).replace('-', ' ')
  return <Layout client={client} title={title}><section className="moduleHero card"><div><span>{client ? 'Client module' : 'Owner module'}</span><h2>{title}</h2><p>This workspace is ready for permissions, mock data and real actions.</p></div><button>Primary Action</button></section><div className="moduleGrid">{list.map((item, index) => <div className="card moduleCard" key={item}><span>0{index + 1}</span><h3>{item}</h3><p>Premium dark SaaS panel prepared for live data, editing, filtering and workflow actions.</p><div className="progress"><i style={{width:`${70 + index * 7}%`}}></i></div></div>)}</div><div className="bottom"><AnalyticsPanel /><TicketPanel /><StatusPanel /></div></Layout>
}
