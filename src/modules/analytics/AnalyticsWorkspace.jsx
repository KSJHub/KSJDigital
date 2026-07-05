import { Layout } from '../../layouts/Shell.jsx'

const statCards = [
  ['Visitors', '3.2K', '+18.6% this month'],
  ['Page Views', '9.8K', '+12.4% this month'],
  ['Bounce Rate', '31%', 'Healthy engagement'],
  ['Avg. Session', '2m 46s', '+22 seconds'],
]

const topPages = [
  ['Homepage', '1,842 views', '58%'],
  ['About', '742 views', '22%'],
  ['Community', '418 views', '13%'],
  ['Merch', '231 views', '7%'],
]

const sources = [
  ['Direct', '42%'],
  ['YouTube', '24%'],
  ['TikTok', '18%'],
  ['Discord', '11%'],
  ['Search', '5%'],
]

const chart = [45, 54, 41, 62, 58, 73, 69, 81, 76, 88, 84, 92]

export function AnalyticsWorkspace({ client = false }) {
  return <Layout client={client} title="Analytics"><section className="analyticsHero card"><div><span>Website Performance</span><h2>{client ? 'Your Website Analytics' : 'Platform Analytics'}</h2><p>{client ? 'Understand how visitors are using your website without needing technical tools.' : 'View traffic, engagement and performance across client websites.'}</p></div><button>Export Report</button></section><div className="analyticsStats">{statCards.map(card => <article className="card analyticsStat" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small>{card[2]}</small></article>)}</div><section className="analyticsLayout"><div className="card analyticsGraph"><div className="panelHead"><h2>Last 30 Days</h2><button>Monthly</button></div><div className="lineBars">{chart.map((value, index) => <span key={index} style={{height:`${value}%`}}></span>)}</div></div><div className="card devicePanel"><h2>Devices</h2><div className="deviceRing"><b>72%</b><small>Desktop</small></div><p><span></span>Desktop 72%</p><p><span></span>Mobile 24%</p><p><span></span>Tablet 4%</p></div></section><div className="analyticsTables"><section className="card analyticsTable"><div className="panelHead"><h2>Top Pages</h2><button>View Pages</button></div>{topPages.map(row => <article key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><small>{row[2]}</small></article>)}</section><section className="card analyticsTable"><div className="panelHead"><h2>Traffic Sources</h2><button>View Sources</button></div>{sources.map(row => <article key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><small>source</small></article>)}</section></div></Layout>
}
