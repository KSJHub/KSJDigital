import { useState } from 'react'
import { Layout, Logo } from '../layouts/Shell.jsx'
import { ActivityPanel, Preview, PublishPanel, QuickActions, Stat, StatusPanel, TicketPanel, WebsiteCard } from '../components/UI.jsx'
import { clientStats, editableFields, getClients, getClientWebsite, getContent, getMediaItems, getOwnerWebsites, getTickets, getUpdateRequests, getWebsitePages, ownerStats, requestUpdate, saveContent } from '../services/platform.js'

export function LoginPage() {
  return <div className="login authLogin"><div className="authBackdrop"></div><section className="card loginCard authCard"><Logo /><span>Secure Portal</span><h1>KSJ DIGITAL</h1><p>Sign in to manage your website.</p><div className="loginFields"><label>Email<input type="email" placeholder="you@example.com" /></label><label>Password<input type="password" placeholder="Enter your password" /></label></div><div className="loginOptions"><label><input type="checkbox" />Remember me</label><a>Forgot password?</a></div><a href="/client">Sign In</a><footer>Need access? Contact your KSJ Digital administrator.</footer></section></div>
}

export function DashboardPage({ client = false }) {
  const visibleWebsites = client ? [getClientWebsite()] : getOwnerWebsites()
  const stats = client ? clientStats : ownerStats
  return <Layout client={client} title={client ? 'My Website' : 'Dashboard'}><div className="stats">{stats.map(item => <Stat key={item[0]} item={item} />)}</div><div className="singleGrid"><section className="card websites"><div className="panelHead"><h2>{client ? 'Your Website' : 'Client Websites'}</h2><button onClick={() => location.href = client ? '/client/website' : '/owner/websites'}>{client ? 'Manage Website' : 'Manage Websites'}</button></div>{visibleWebsites.map((site, index) => <WebsiteCard key={site.name} site={site} active={index === 0} />)}</section><Preview /></div><div className="bottom four"><ActivityPanel /><PublishPanel /><TicketPanel /><StatusPanel /></div><QuickActions client={client} /></Layout>
}

export function WebsitePage() {
  const website = getClientWebsite()
  const pages = getWebsitePages()
  const mediaItems = getMediaItems()
  return <Layout client title="My Website"><section className="clientSyncHero card websiteManagerHero"><div><span>Website Hub</span><h2>{website.name}</h2><p>Edit pages, manage media, check basics, and request updates from one simple workspace.</p></div><div className="repoCard clientSummary"><b>{website.status}</b><small>{website.domain}</small><small>No technical tools shown</small><a href="/client/editor">Edit Website</a></div></section><section className="simpleWebsiteGrid"><div className="card managerPanel mainWork"><div className="panelHead"><h2>Pages</h2><button onClick={() => location.href='/client/editor'}>Edit Content</button></div>{pages.map((page, index) => <article className="simplePageRow" key={page}><div><b>{page}</b><small>{index === 0 ? '/' : '/' + page.toLowerCase()} · {index < 5 ? 'Published' : 'Draft'}</small></div><span>{index < 5 ? 'Live' : 'Draft'}</span><button onClick={() => location.href='/client/editor'}>Edit</button></article>)}</div><aside className="card managerPanel nextSteps"><h2>What do you want to do?</h2><button onClick={() => location.href='/client/editor'}>Edit website text</button><button onClick={() => location.href='/client/media'}>Upload images</button><button onClick={() => location.href='/client/publish'}>Request update</button><button onClick={() => location.href='/client/support'}>Ask KSJ for help</button></aside></section><section className="simpleWebsiteGrid"><div className="card managerPanel"><div className="panelHead"><h2>Media</h2><button onClick={() => location.href='/client/media'}>Open Media</button></div><div className="miniMediaGrid">{mediaItems.slice(0,6).map(item => <article key={item}><b>{item.slice(0,2).toUpperCase()}</b><span>{item}</span></article>)}</div></div><div className="card managerPanel publishBox"><h2>Updates</h2><p>Save your changes and request an update. KSJ Digital reviews everything before it goes live.</p><div className="publishSteps"><span>1. Edit</span><span>2. Save</span><span>3. Request update</span><span>4. KSJ approves</span></div><button onClick={() => location.href='/client/publish'}>Request Update</button></div></section></Layout>
}

export function EditorPage({ client = false }) {
  const [fields, setFields] = useState(getContent)
  const [notice, setNotice] = useState('Ready')
  const pages = getWebsitePages()
  const update = (key, value) => setFields(current => ({ ...current, [key]: value }))
  const save = () => setNotice(saveContent(fields).status)
  const submit = () => { requestUpdate(fields); setNotice('Update requested') }
  return <Layout client={client} title="Pages"><section className="editorTopbar card"><div><span>Website Editor</span><h2>Homepage</h2><p>Edit normal website content. The design and technical setup stay protected.</p></div><div><button onClick={save}>Save</button><button onClick={submit}>Request Update</button></div></section><section className="editorGrid advanced"><div className="card pageList"><div className="panelHead"><h2>Pages</h2><button>Add Page</button></div>{pages.map((page, index) => <button className={index === 0 ? 'selected' : ''} key={page}>{page}<small>{index < 5 ? 'Live' : 'Draft'}</small></button>)}</div><div className="card editorPanel"><div className="panelHead"><h2>Edit Content</h2><button>{notice}</button></div>{editableFields.map(([label]) => <label key={label}>{label}<input value={fields[label]} onChange={event => update(label, event.target.value)} /><small>Website field</small></label>)}</div><div className="card clientPreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span></div><div className="mockHero compact"><p>WELCOME TO</p><h2>{fields['Hero Title']}</h2><h4>{fields['Subtitle']}</h4><button>{fields['Button Text']}</button></div></div></section></Layout>
}

export function MediaPage({ client = false }) {
  const mediaItems = getMediaItems()
  return <Layout client={client} title="Media"><section className="mediaHero card"><div><span>Website Media</span><h2>Images & Files</h2><p>Upload and organise images used across your website.</p></div><button>Upload Media</button></section><div className="mediaGrid advancedMedia">{mediaItems.map((item, index) => <article className="card mediaItem" key={item}><div>{item.slice(0,2).toUpperCase()}</div><b>{item}</b><small>{index % 2 ? 'Used on website' : 'Brand asset'}</small><p>Ready for website use.</p><footer><button>Preview</button><button>Use</button></footer></article>)}</div></Layout>
}

export function PublishPage({ client = false }) {
  const rows = getUpdateRequests()
  return <Layout client={client} title={client ? 'Updates' : 'Publishing'}><section className="moduleHero card"><div><span>{client ? 'Website Updates' : 'Owner Review'}</span><h2>{client ? 'Request Update' : 'Review Updates'}</h2><p>{client ? 'Send saved website changes to KSJ Digital for review.' : 'Review client changes before they go live.'}</p></div><button>{client ? 'Request Update' : 'Review'}</button></section><section className="card publishPanel wide"><div className="panelHead"><h2>{client ? 'My Requests' : 'Update Requests'}</h2><button>New Request</button></div>{rows.map(row => <article className="publishRow" key={row[0]}><div><b>{row[0]}</b><small>{row[1]}</small></div><span>{row[2]}</span><button>Open</button></article>)}</section></Layout>
}

export function SupportPage({ client = false }) {
  const tickets = getTickets()
  return <Layout client={client} title="Support"><section className="supportHero card"><div><span>Support</span><h2>How can KSJ Digital help?</h2><p>Open a request and track replies from your portal.</p></div><button>New Ticket</button></section><section className="card ticketInbox"><div className="panelHead"><h2>Tickets</h2><button>Filter</button></div>{tickets.map(ticket => <article key={ticket[1]}><div><b>{ticket[1]}</b><small>{ticket[0]}</small></div><span>Open</span><em>{ticket[2]}</em></article>)}</section></Layout>
}

export function SettingsPage({ client = false }) {
  return <Layout client={client} title="Settings"><section className="settingsHero card"><div><span>Settings</span><h2>{client ? 'Website Settings' : 'KSJ Digital Settings'}</h2><p>Manage account, notifications and website preferences.</p></div><button>Save</button></section><section className="card settingsForm"><div className="panelHead"><h2>Details</h2><button>Update</button></div><label>{client ? 'Website Name' : 'Business Name'}<input defaultValue={client ? 'TwoToneTaj' : 'KSJ Digital'} /></label><label>Email<input defaultValue="support@ksjdigital.co.uk" /></label><label>Notifications<select><option>Email and portal notifications</option><option>Portal only</option></select></label></section></Layout>
}

export function WebsitesPage() {
  const websites = getOwnerWebsites()
  return <Layout title="Websites"><section className="websitesHero card"><div><span>Owner</span><h2>Websites</h2><p>Manage websites, review drafts and publish approved changes.</p></div><button>Add Website</button></section><section className="card websiteListPanel"><div className="panelHead"><h2>Website List</h2><button>Add Website</button></div>{websites.map((site, index) => <WebsiteCard key={site.name} site={site} active={index === 0} />)}</section></Layout>
}

export function ClientsPage() {
  const clients = getClients()
  return <Layout title="Clients"><section className="moduleHero card"><div><span>Owner</span><h2>Clients</h2><p>Add clients and assign them to websites.</p></div><button>Add Client</button></section><section className="card accessPanel"><div className="panelHead"><h2>Client List</h2><button>Save</button></div>{clients.map(client => <article className="accessRow" key={client.id}><div><b>{client.websiteName}</b><small>{client.name} · {client.access}</small></div><span>{client.status}</span><small>{client.websiteName}</small><button>Manage</button></article>)}</section></Layout>
}
