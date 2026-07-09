import { getPermissionSummary } from '../services/auth.js'

function liveUrl(domain = '') {
  return domain.startsWith('http') ? domain : `https://${domain}`
}

export function Stat({ item }) {
  return (
    <div className="card stat">
      <div>
        <span>{item[0]}</span>
        <strong>{item[1]}</strong>
        <small>{item[2]}</small>
      </div>
      <i />
    </div>
  )
}

export function WebsiteCard({ site, active = false, client = false }) {
  const actions = client
    ? [
        ['Open', () => window.open(liveUrl(site.domain), '_blank')],
        ['Pages', () => (location.href = '/client/editor')],
        ['Media', () => (location.href = '/client/media')],
        ['Branding', () => (location.href = '/client/branding')],
        ['Updates', () => (location.href = '/client/publish')],
      ]
    : [
        ['Open', () => window.open(liveUrl(site.domain), '_blank')],
        ['Manage', () => (location.href = '/owner/websites')],
        ['Clients', () => (location.href = '/owner/clients')],
        ['Branding', () => (location.href = '/owner/branding')],
        ['Updates', () => (location.href = '/owner/publish-requests')],
      ]

  return (
    <article className={active ? 'website activeSite websiteControl' : 'website websiteControl'}>
      <div className="thumb">{site.logo}</div>
      <div>
        <h3>
          {site.name} <em>{site.status}</em>
        </h3>
        <p>
          {site.domain} · {site.plan}
        </p>
        <div className="siteStats">
          <b>
            {site.pageCount}
            <small>Pages</small>
          </b>
          <b>
            {site.mediaCount}
            <small>Media</small>
          </b>
          <b>
            {site.owner}
            <small>Owner</small>
          </b>
          <b>
            {site.seo}%<small>SEO</small>
          </b>
          <b>
            {site.performance}%<small>Speed</small>
          </b>
        </div>
        <div className="websiteActions">
          {actions.map(([label, action]) => (
            <button key={label} onClick={action}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

export function PermissionBanner({ account, client = false }) {
  const summary = getPermissionSummary(account)

  return (
    <section className="permissionBanner card">
      <div>
        <span>{client ? 'Client Portal' : 'Owner Portal'}</span>
        <h2>{account.label}</h2>
        <p>
          {summary.access} · {summary.edit} · {summary.publish}
        </p>
      </div>
      <div className="permissionPills">
        <b>{summary.role}</b>
        <small>{account.name}</small>
      </div>
    </section>
  )
}

export function AccessDenied({ account }) {
  return (
    <div className="login">
      <section className="card accessDenied">
        <h1>Access Restricted</h1>
        <p>{account.name} does not have permission to open this area.</p>
        <a href={account.home}>Go to dashboard</a>
      </section>
    </div>
  )
}

export function Preview() {
  return (
    <section className="card preview">
      <div className="panelHead">
        <h2>Website Preview</h2>
        <div>
          <button>Desktop</button>
          <button>Mobile</button>
        </div>
      </div>
      <div className="sitePreview">
        <div className="mockNav">
          <b>KSJ</b>
          <span>HOME</span>
          <span>ABOUT</span>
          <span>COMMUNITY</span>
          <span>MERCH</span>
          <span>CONTACT</span>
        </div>
        <div className="mockHero">
          <p>MANAGED WEBSITE</p>
          <h2>
            CLIENT<span>SITE</span>
          </h2>
          <h4>Editable content powered by KSJ Digital.</h4>
          <button>PRIMARY ACTION</button>
        </div>
      </div>
      <footer>
        <span></span> Live <button>Visit Live Site ↗</button>
      </footer>
    </section>
  )
}

export function ActivityPanel() {
  const activity = [
    'API content foundation active',
    'Website manager moved server-side',
    'Client manager moved server-side',
    'Forms migrated to API storage',
    'Site settings editor connected',
  ]

  return (
    <section className="card activity">
      <div className="panelHead">
        <h2>Recent Website Activity</h2>
        <a>View All</a>
      </div>
      {activity.map((item, index) => (
        <p key={item}>
          <i></i>
          <b>{item}</b>
          <small>{index + 1} step</small>
        </p>
      ))}
    </section>
  )
}

export function TicketPanel() {
  return (
    <section className="card tickets">
      <div className="panelHead">
        <h2>Support</h2>
        <a onClick={() => (location.href = '/owner/support')}>Open Support</a>
      </div>
      <p>
        <b>
          Support centre connected
          <small>API-backed tickets</small>
        </b>
        <em>Ready</em>
      </p>
    </section>
  )
}

export function QuickActions({ client = false }) {
  const actions = client
    ? [
        ['Edit Website', '/client/editor'],
        ['Manage Media', '/client/media'],
        ['Request Update', '/client/publish'],
        ['Open Support', '/client/support'],
        ['Website Settings', '/client/settings'],
      ]
    : [
        ['Manage Websites', '/owner/websites'],
        ['Add Client', '/owner/clients'],
        ['Review Updates', '/owner/publish-requests'],
        ['Open Support', '/owner/support'],
        ['Settings', '/owner/settings'],
      ]

  return (
    <section className="card quick">
      <h2>Quick Actions</h2>
      <div>
        {actions.map(([label, path]) => (
          <button key={label} onClick={() => (location.href = path)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function StatusPanel() {
  return (
    <section className="card status">
      <h2>Website Health</h2>
      <h3>✓ Ready</h3>
      {['Website online', 'Content safe', 'Media ready', 'Updates protected'].map(item => (
        <p key={item}>
          <span>✓</span>
          {item}
          <small>OK</small>
        </p>
      ))}
    </section>
  )
}

export function PublishPanel() {
  return (
    <section className="card status">
      <h2>Updates</h2>
      <h3>Owner approval required</h3>
      {[
        'Client saves draft',
        'Client requests update',
        'KSJ reviews update',
        'Website goes live',
      ].map(item => (
        <p key={item}>
          <span>✓</span>
          {item}
          <small>Step</small>
        </p>
      ))}
    </section>
  )
}
