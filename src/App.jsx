const websites = [
  { name: 'TwoToneTaj', domain: 'twotonetaj.com', status: 'Live', pages: 12, media: 842, visits: '3.2K', logo: 'TAJ', plan: 'Premium', seo: 94, performance: 98 },
  { name: 'KSJ Diamond Gaming', domain: 'ksjdiamondgaming.com', status: 'Coming Soon', pages: 8, media: 215, visits: '0', logo: 'KD', plan: 'Launch', seo: 82, performance: 91 },
  { name: 'Goliath', domain: 'goliath.gg', status: 'In Development', pages: 6, media: 191, visits: '156', logo: 'G', plan: 'Build', seo: 77, performance: 88 },
]

const ownerStats = [['Total Websites','3','Active websites'],['Published Pages','24','Across all websites'],['Media Files','1,248','In your library'],['Total Visits','12.4K','Last 30 days']]
const clientStats = [['My Websites','1','Active website'],['Total Pages','12','Published pages'],['Media Files','842','In your library'],['Visitors','3.2K','Last 30 days']]
const modules = {
  websites: ['Website cards','Preview controls','Publishing status','SEO and performance scores'],
  clients: ['Client records','Access levels','Assigned websites','Account notes'],
  analytics: ['Traffic overview','Device breakdown','Top pages','Performance trends'],
  support: ['Open tickets','Priority queue','Client messages','Help centre'],
  settings: ['Account profile','Platform controls','Security','Notifications'],
  editor: ['Pages','Content sections','Navigation','SEO fields'],
  media: ['Uploads','Folders','Image usage','Storage'],
}

function Logo(){return <div className="logo"><div className="logoMark">K</div><b>KSJ DIGITAL</b></div>}
function route(){return location.pathname.replace(/\/$/,'') || '/'}
function go(path){location.href=path}

function Sidebar({client=false}){
 const items = client ? [
  ['/client','Dashboard'],['/client/website','My Website'],['/client/editor','Pages / Editor'],['/client/media','Media Library'],['/client/analytics','Analytics'],['/client/support','Support'],['/client/settings','Settings']
 ] : [
  ['/owner','Dashboard'],['/owner/websites','Websites'],['/owner/clients','Clients'],['/owner/analytics','Analytics'],['/owner/support','Support'],['/owner/settings','Settings']
 ]
 const current = route()
 return <aside className="sidebar"><Logo/><nav>{items.map(([path,label])=><button className={current===path?'active':''} key={path} onClick={()=>go(path)}>{label}</button>)}</nav><div className="supportBox"><b>Need Help?</b><p>Support, updates and client requests in one place.</p><button onClick={()=>go(client?'/client/support':'/owner/support')}>Contact Support</button></div></aside>
}

function Header({client=false,title}){return <header className="header"><div><span>{client?'Client Portal':'Owner Platform'}</span><h1>{title || (client?'Taj (TwoToneTaj)':'Morgan')} 👋</h1><p>{client?'Manage your website, content and support from one dashboard.':'Manage every KSJ Digital website, client and service from one dashboard.'}</p></div><div className="tools"><div className="search">Search everything...</div><button>🔔 3</button><button>KSJ DIGITAL <span className="miniAvatar">{client?'T':'M'}</span></button></div></header>}
function Stat({item}){return <div className="card stat"><div><span>{item[0]}</span><strong>{item[1]}</strong><small>{item[2]}</small></div><i/></div>}
function WebsiteCard({site,active=false}){return <article className={active?'website activeSite':'website'}><div className="thumb">{site.logo}</div><div><h3>{site.name} <em>{site.status}</em></h3><p>{site.domain} · {site.plan}</p><div className="siteStats"><b>{site.pages}<small>Pages</small></b><b>{site.media}<small>Media</small></b><b>{site.visits}<small>Visits</small></b><b>{site.seo}%<small>SEO</small></b></div></div><button>Manage</button></article>}
function Preview(){return <section className="card preview"><div className="panelHead"><h2>Website Preview</h2><div><button>Desktop</button><button>Tablet</button><button>Mobile</button></div></div><div className="sitePreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span><span>MERCH</span><span>CONTACT</span></div><div className="mockHero"><p>WELCOME TO</p><h2>TWOTONE<span>TAJ</span></h2><h4>It&apos;s all about the 💩 and giggles, folks.</h4><button>JOIN THE SQUAD</button></div></div><footer><span></span> Live <button>Visit Live Site ↗</button></footer></section>}
function ActivityPanel(){return <section className="card activity"><div className="panelHead"><h2>Recent Activity</h2><a>View All</a></div>{['Homepage updated','New banner uploaded','About page published','Support ticket replied','Analytics report ready'].map((x,i)=><p key={x}><i></i><b>{x}</b><small>{i+1}h ago</small></p>)}</section>}
function QuickActions({client=false}){const actions=client?['Edit Website','Add Page','Upload Media','Open Support','View Analytics','Update Settings']:['Create Website','Add Client','Review Tickets','Publish Changes','Open Analytics','Platform Settings'];return <section className="card quick"><h2>Quick Actions</h2><div>{actions.map(x=><button key={x}>{x}</button>)}</div></section>}
function StatusPanel(){return <section className="card status"><h2>System Status</h2><h3>✓ All Systems Operational</h3>{['Website Hosting','Database','CDN','Backups'].map(x=><p key={x}><span>✓</span>{x}<small>Operational</small></p>)}</section>}

function Dashboard({client=false}){return <div className="shell"><Sidebar client={client}/><main><Header client={client}/><div className="stats">{(client?clientStats:ownerStats).map(item=><Stat key={item[0]} item={item}/>)}</div><div className="singleGrid"><section className="card websites"><div className="panelHead"><h2>{client?'My Website':'Your Websites'}</h2><button>{client?'Edit Website':'Create New Website'}</button></div>{(client?[websites[0]]:websites).map((site,i)=><WebsiteCard key={site.name} site={site} active={i===0}/>)}</section><Preview/></div><div className="bottom"><ActivityPanel/><QuickActions client={client}/><StatusPanel/></div></main></div>}

function ModulePage({client=false,type='websites'}){const list=modules[type]||modules.websites;const title=type[0].toUpperCase()+type.slice(1).replace('-',' ');return <div className="shell"><Sidebar client={client}/><main><Header client={client} title={title}/><section className="moduleHero card"><div><span>{client?'Client module':'Owner module'}</span><h2>{title}</h2><p>This module is wired into the ecosystem shell and ready for the next build stage.</p></div><button>Primary Action</button></section><div className="moduleGrid">{list.map((x,i)=><div className="card moduleCard" key={x}><span>0{i+1}</span><h3>{x}</h3><p>Premium dark SaaS panel prepared for real data, permissions and actions.</p></div>)}</div></main></div>}
function Login(){return <div className="login"><div className="card loginCard"><Logo/><h1>KSJ Digital Ecosystem</h1><p>The central hub for managing websites, content, media, analytics and support.</p><a href="/owner">Open Owner Platform</a><a href="/client">Open Client Portal</a></div></div>}
export default function App(){const p=route();if(p==='/owner')return <Dashboard/>;if(p==='/client')return <Dashboard client/>;if(p.startsWith('/owner/'))return <ModulePage type={p.split('/')[2]}/>;if(p.startsWith('/client/'))return <ModulePage client type={p.split('/')[2]==='website'?'websites':p.split('/')[2]}/>;return <Login/>}
