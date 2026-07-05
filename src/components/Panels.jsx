import { tickets } from '../services/mockData.js'

export function Preview(){return <section className="card preview"><div className="panelHead"><h2>Website Preview</h2><div><button>Desktop</button><button>Mobile</button></div></div><div className="sitePreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span><span>MERCH</span><span>CONTACT</span></div><div className="mockHero"><p>WELCOME TO</p><h2>TWOTONE<span>TAJ</span></h2><h4>It&apos;s all about the 💩 and giggles, folks.</h4><button>JOIN THE SQUAD</button></div></div><footer><span></span> Live <button>Visit Live Site ↗</button></footer></section>}

export function ActivityPanel(){return <section className="card activity"><div className="panelHead"><h2>Recent Website Activity</h2><a>View All</a></div>{['Homepage draft saved','New image uploaded','About page edited','Publish request created','Support reply received'].map((x,i)=><p key={x}><i></i><b>{x}</b><small>{i+1}h ago</small></p>)}</section>}

export function TicketPanel(){return <section className="card tickets"><div className="panelHead"><h2>Support</h2><a>Open Support</a></div>{tickets.slice(0,3).map(([client,subject,priority])=><p key={subject}><b>{subject}<small>{client}</small></b><em>{priority}</em></p>)}</section>}

export function QuickActions({client=false}){const actions=client?[['Edit Website','/client/editor'],['Manage Media','/client/media'],['Request Publish','/client/publish'],['Open Support','/client/support'],['Website Settings','/client/settings']]:[['Manage Websites','/owner/websites'],['Add Client','/owner/clients'],['Review Publishing','/owner/publish-requests'],['Open Support','/owner/support'],['Settings','/owner/settings']];return <section className="card quick"><h2>Quick Actions</h2><div>{actions.map(([label,path])=><button key={label} onClick={()=>location.href=path}>{label}</button>)}</div></section>}

export function StatusPanel(){return <section className="card status"><h2>Website Health</h2><h3>✓ Ready</h3>{['Website online','Content safe','Media ready','Publishing protected'].map(x=><p key={x}><span>✓</span>{x}<small>OK</small></p>)}</section>}

export function PublishPanel(){return <section className="card status"><h2>Publishing</h2><h3>Owner approval required</h3>{['Client saves draft','Client requests publish','KSJ reviews update','Website goes live'].map(x=><p key={x}><span>✓</span>{x}<small>Step</small></p>)}</section>}
