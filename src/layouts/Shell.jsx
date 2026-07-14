import { getAccountFromPath, signOut } from '../services/auth.js'
import { PermissionBanner } from '../components/UI.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function go(path) {
  location.href = path
}

function clientItemAllowed(account, permission) {
  if (!permission || !account || account.role === 'owner') return true
  return !!account[permission]
}

const ownerGroups = [
  {
    label: 'Overview',
    items: [
      ['/owner', 'Dashboard'],
      ['/owner/websites', 'Websites'],
      ['/owner/clients', 'Clients'],
    ],
  },
  {
    label: 'Website Management',
    items: [
      ['/owner/editor', 'Website Editor'],
      ['/owner/branding', 'Branding'],
      ['/owner/forms', 'Forms'],
      ['/owner/merch', 'Merch'],
    ],
  },
  {
    label: 'Commerce',
    items: [
      ['/owner/inventory', 'Inventory'],
      ['/owner/orders', 'Orders'],
      ['/owner/commerce', 'Payments'],
    ],
  },
  {
    label: 'Operations',
    items: [
      ['/owner/publish-requests', 'Approvals'],
      ['/owner/support', 'Support'],
      ['/owner/operations', 'Operations'],
      ['/owner/settings', 'Settings'],
    ],
  },
]

const clientGroups = [
  {
    label: 'My Website',
    items: [
      ['/client', 'Home'],
      ['/client/editor', 'Edit Website', 'canEdit'],
      ['/client/merch', 'Merch', 'canEdit'],
      ['/client/orders', 'Orders', 'canEdit'],
    ],
  },
  {
    label: 'Account',
    items: [
      ['/client/publish', 'Updates', 'canRequestUpdates'],
      ['/client/support', 'Help', 'canViewSupport'],
    ],
  },
]

export function Logo() {
  return (
    <div className="logo brandLogo">
      <img src="/ksj-digital-logo.svg" alt="KSJ Digital" />
    </div>
  )
}

export function Sidebar({ client = false, account = null }) {
  const groups = client ? clientGroups : ownerGroups
  const current = route()

  return (
    <aside className={client ? 'sidebar clientSidebar' : 'sidebar'}>
      <Logo />
      <nav>
        {groups.map(group => {
          const items = group.items.filter(([, , permission]) => !client || clientItemAllowed(account, permission))
          if (!items.length) return null

          return (
            <div className="navGroup" key={group.label}>
              <div className="navGroupLabel">{group.label}</div>
              {items.map(([path, label]) => (
                <button className={current === path ? 'active' : ''} key={path} onClick={() => go(path)}>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </nav>
      <div className="supportBox">
        <b>{client ? 'Your Website' : 'Owner Control'}</b>
        <p>{client ? 'Edit, review and submit changes from one simple portal.' : 'Manage websites, clients, approvals and platform operations.'}</p>
        <button onClick={() => go(client ? '/client/editor' : '/owner/websites')}>
          {client ? 'Edit Website' : 'Manage Websites'}
        </button>
      </div>
    </aside>
  )
}

export function Header({ client = false, title, account }) {
  const activeAccount = account || getAccountFromPath() || {
    label: 'KSJ Digital',
    name: 'KSJ',
  }

  return (
    <header className="header">
      <div>
        <span>{client ? 'Website Portal' : 'Owner Portal'}</span>
        <h1>{title || activeAccount.name} 👋</h1>
        <p>
          {client
            ? 'Manage your website and submit changes for approval.'
            : 'Manage every website, client, approval and platform setting.'}
        </p>
      </div>
      <div className="tools">
        <button onClick={() => go(client ? '/client/settings' : '/owner/settings')}>
          {activeAccount.label}
          <span className="miniAvatar">{activeAccount.name?.[0] || 'K'}</span>
        </button>
        <button onClick={signOut}>Logout</button>
      </div>
    </header>
  )
}

export function Layout({ client = false, title, children }) {
  const account = getAccountFromPath()

  return (
    <div className="shell">
      <Sidebar client={client} account={account} />
      <main>
        <Header client={client} title={title} account={account} />
        {!client && <PermissionBanner client={false} account={account} />}
        {children}
      </main>
    </div>
  )
}
