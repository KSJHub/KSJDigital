import { getPermissionSummary } from '../services/auth.js'

function liveUrl(domain = '') {
  return domain.startsWith('http') ? domain : `https://${domain}`
}

function clientActionAllowed(account, label) {
  if (!account || account.role === 'owner') return true
  if (label === 'Pages' || label === 'Edit Website') return !!account.canEdit
  if (label === 'Media' || label === 'Branding' || label === 'Manage Media') return !!account.canManageMedia
  if (label === 'Updates' || label === 'Request Update') return !!account.canRequestUpdates
  if (label === 'Open Support') return !!account.canViewSupport
  return true
}

function asyncStateDetails(state = 'idle') {
  if (state === 'loading') return { icon: '…', label: 'Loading', live: 'polite' }
  if (state === 'saving') return { icon: '…', label: 'Saving', live: 'polite' }
  if (state === 'success') return { icon: '✓', label: 'Saved', live: 'polite' }
  if (state === 'error') return { icon: '!', label: 'Action failed', live: 'assertive' }
  return { icon: '', label: '', live: 'polite' }
}

export function AsyncStatus({ state = 'idle', message = '', className = '' }) {
  if (state === 'idle' && !message) return null
  const details = asyncStateDetails(state)
  const text = message || details.label

  return (
    <span className={`asyncStatus asyncStatus-${state}${className ? ` ${className}` : ''}`} role={state === 'error' ? 'alert' : 'status'} aria-live={details.live} aria-atomic="true">
      {details.icon && <span aria-hidden="true">{details.icon}</span>}
      <span>{text}</span>
    </span>
  )
}

export function LoadingButton({ loading = false, success = false, loadingLabel = 'Working…', successLabel = 'Done', children, disabled = false, className = '', ...props }) {
  const state = loading ? 'loading' : success ? 'success' : 'idle'
  const label = loading ? loadingLabel : success ? successLabel : children

  return (
    <button {...props} className={`loadingButton loadingButton-${state}${className ? ` ${className}` : ''}`} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span aria-hidden="true">…</span>}
      {success && <span aria-hidden="true">✓</span>}
      <span>{label}</span>
    </button>
  )
}

function SkeletonLine({ width = '100%', className = '' }) {
  return <span className={`skeletonBlock skeletonLine${className ? ` ${className}` : ''}`} style={{ width }} aria-hidden="true" />
}

export function SkeletonCard({ lines = 3, className = '' }) {
  const count = Math.max(1, Math.min(8, Number(lines) || 3))
  return (
    <section className={`card skeletonCard${className ? ` ${className}` : ''}`} aria-label="Loading content" aria-busy="true">
      <span className="skeletonBlock skeletonTitle" aria-hidden="true" />
      {Array.from({ length: count }, (_, index) => <SkeletonLine key={index} width={index === count - 1 ? '68%' : '100%'} />)}
    </section>
  )
}

export function SkeletonList({ rows = 4, className = '' }) {
  const count = Math.max(1, Math.min(12, Number(rows) || 4))
  return (
    <div className={`skeletonList${className ? ` ${className}` : ''}`} aria-label="Loading list" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeletonListRow" key={index}>
          <span className="skeletonBlock skeletonAvatar" aria-hidden="true" />
          <div><SkeletonLine width="76%" /><SkeletonLine width="48%" /></div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }) {
  const rowCount = Math.max(1, Math.min(12, Number(rows) || 5))
  const columnCount = Math.max(1, Math.min(8, Number(columns) || 4))
  return (
    <div className={`skeletonTable${className ? ` ${className}` : ''}`} aria-label="Loading table" aria-busy="true">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <div className="skeletonTableRow" style={{ '--skeleton-columns': columnCount }} key={rowIndex}>
          {Array.from({ length: columnCount }, (_, columnIndex) => <SkeletonLine key={columnIndex} width={columnIndex === columnCount - 1 ? '72%' : '100%'} />)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonForm({ fields = 4, className = '' }) {
  const count = Math.max(1, Math.min(10, Number(fields) || 4))
  return (
    <div className={`skeletonForm${className ? ` ${className}` : ''}`} aria-label="Loading form" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <label className="skeletonFormField" key={index}>
          <SkeletonLine width="34%" />
          <span className="skeletonBlock skeletonInput" aria-hidden="true" />
        </label>
      ))}
    </div>
  )
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

export function WebsiteCard({ site, active = false, client = false, account = null }) {
  const actions = (client
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
  ).filter(([label]) => !client || clientActionAllowed(account, label))

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

export function TicketPanel({ client = false, account = null }) {
  if (client && !clientActionAllowed(account, 'Open Support')) return null

  return (
    <section className="card tickets">
      <div className="panelHead">
        <h2>Support</h2>
        <a onClick={() => (location.href = client ? '/client/support' : '/owner/support')}>Open Support</a>
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

export function QuickActions({ client = false, account = null }) {
  const actions = (client
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
  ).filter(([label]) => !client || clientActionAllowed(account, label))

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

export function PublishPanel({ client = false, account = null }) {
  if (client && !clientActionAllowed(account, 'Request Update')) return null

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
