const websites = [
  { name: 'TwoToneTaj', domain: 'twotonetaj.com', status: 'Live', pages: 12, media: 842, visits: '3.2K', logo: 'TAJ' },
  { name: 'KSJ Diamond Gaming', domain: 'ksjdiamondgaming.com', status: 'Coming Soon', pages: 8, media: 215, visits: '0', logo: 'KD' },
  { name: 'Goliath', domain: 'goliath.gg', status: 'In Development', pages: 6, media: 191, visits: '156', logo: 'G' },
]

const ownerStats = [
  ['Total Websites', '3', 'Active websites'],
  ['Published Pages', '24', 'Across all websites'],
  ['Media Files', '1,248', 'In your library'],
  ['Total Visits (30d)', '12.4K', '+18.6%'],
]

const clientStats = [
  ['My Websites', '1', 'Active websites'],
  ['Total Pages', '12', 'Published pages'],
  ['Media Files', '842', 'In your library'],
  ['Total Visitors (30d)', '3.2K', '+18.6%'],
]

function Logo() {
  return <div className="logo"><div className="logoMark">K</div><div><b>KSJ DIGITAL</b></div></div>
}

function Sidebar({ client = false }) {
  const items = client
    ? ['Dashboard','My Websites','Pages','Content','Media Library','Branding & Theme','Menus & Navigation','Blog / News','Merch / Store','Forms & Inquiries','Social Links','Analytics','SEO','Visitors','Users & Access','Account Settings','Billing & Plan','Support Tickets']
    : ['Dashboard','Websites','Pages','Content','Media Library','Branding & Theme','Menus & Navigation','Blog / News','Merch / Store','Forms & Inquiries','Social Links','Analytics','SEO','Visitors','Users & Access','Account Settings','Billing & Plan','Support Tickets']
  return <aside className="sidebar"><Logo/><nav>{items.map((item, index) => <a className={index === 0 ? 'active' : ''} key={item}>{item}</a>)}</nav><div className="supportBox"><b>Need Help?</b><p>Our support team is here to help you.</p><button>Contact Support</button></div></aside>
}

function Header({ client = false }) {
  return <header className="header"><div><span>Welcome back,</span><h1>{client ? 'Taj (TwoToneTaj)' : 'Morgan'} 👋</h1><p>{client ? 'Manage your websites, content and settings all in one place.' : 'Here is what is happening with your platform today.'}</p></div><div className="tools"><div className="search">Search...</div><button>🔔 3</button><button>KSJ DIGITAL <span className="miniAvatar">{client ? 'T' : 'M'}</span></button></div></header>
}

function Stat({ item }) {
  return <div className="card stat"><div><span>{item[0]}</span><strong>{item[1]}</strong><small>{item[2]}</small></div><i /></div>
}

function WebsiteCard({ site, active = false }) {
  return <article className={active ? 'website activeSite' : 'website'}><div className="thumb">{site.logo}</div><div className="siteContent"><h3>{site.name} <em>{site.status}</em></h3><p>{site.domain} ↗</p><div className="siteStats"><b>{site.pages}<small>Pages</small></b><b>{site.media}<small>Media</small></b><b>{site.visits}<small>Visits</small></b></div></div><button>Edit Website</button></article>
}

function Preview() {
  return <section className="card preview"><div className="panelHead"><h2>Website Preview</h2><button>Desktop</button></div><div className="sitePreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span><span>MERCH</span><span>CONTACT</span></div><div className="mockHero"><p>WELCOME TO</p><h2>TWOTONE<span>TAJ</span></h2><h4>It&apos;s all about the 💩 and giggles, folks.</h4><button>JOIN THE SQUAD</button></div></div><footer><span></span> Live <button>Visit Live Site ↗</button></footer></section>
}

function ActivityPanel(){ return <section className="card activity"><div className="panelHead"><h2>Recent Activity</h2><a>View All</a></div>{['Homepage updated','New banner uploaded','About page published','New merch item added'].map((x,i)=><p key={x}><i></i><b>{x}</b><small>{i + 1} hours ago</small></p>)}</section> }
function QuickActions(){ return <section className="card quick"><h2>Quick Actions</h2><div>{['Edit Pages','Add New Page','Upload Media','Blog / News','Manage Menu','Edit Branding','View Analytics','SEO Checker','Form Submissions'].map(x=><button key={x}>{x}</button>)}</div></section> }
function StatusPanel(){ return <section className="card status"><h2>System Status</h2><h3>✓ All Systems Operational</h3>{['Website Hosting','Database','CDN','Backup'].map(x=><p key={x}><span>✓</span>{x}<small>Operational</small></p>)}</section> }

function Owner(){ return <div className="shell"><Sidebar/><main><Header/><div className="stats">{ownerStats.map(item=><Stat key={item[0]} item={item}/>)}</div><div className="singleGrid"><section className="card websites"><div className="panelHead"><h2>Your Websites</h2><button>Create New Website</button></div>{websites.map((site,i)=><WebsiteCard key={site.name} site={site} active={i===0}/>) }<div className="createBox">+ Create New Website</div></section><Preview/></div><div className="bottom"><ActivityPanel/><QuickActions/><StatusPanel/></div></main></div> }

function Client(){ return <div className="shell client"><Sidebar client/><main><Header client/><div className="stats">{clientStats.map(item=><Stat key={item[0]} item={item}/>)}</div><div className="singleGrid"><section className="card websites"><div className="panelHead"><h2>My Websites</h2><button>Create New Website</button></div><WebsiteCard site={websites[0]} active/><div className="clientMetrics"><b>12<small>Pages</small></b><b>24<small>Blog Posts</small></b><b>842<small>Media Files</small></b><b>3.2K<small>Visitors</small></b><b>98%<small>Uptime</small></b></div></section><Preview/></div><div className="bottom"><ActivityPanel/><QuickActions/><StatusPanel/></div></main></div> }

function Login(){ return <div className="login"><div className="card loginCard"><Logo/><h1>KSJ Digital Ecosystem</h1><p>The central hub for managing websites, content, media, analytics and support.</p><a href="/owner">Open Owner Platform</a><a href="/client">Open Client Portal</a></div></div> }

export default function App(){ if(location.pathname.startsWith('/owner')) return <Owner/>; if(location.pathname.startsWith('/client')) return <Client/>; return <Login/> }
