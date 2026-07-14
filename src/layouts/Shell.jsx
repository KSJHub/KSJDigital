import { getAccountFromPath, signOut } from '../services/auth.js'
import { PermissionBanner } from '../components/UI.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function go(path) {
  location.href = path
}

function clientItemAllowed(account, permission) {
  if (!permission || !account) return true
  return !!account[permission]
}

const ownerGroups = [
  { label: 'Overview', items: [['/owner', 'Dashboard'], ['/owner/websites', 'Websites'], ['/owner/clients', 'Website Access']] },
  { label: 'Website Management', items: [['/owner/editor', 'Website Editor'], ['/owner/branding', 'Branding'], ['/owner/forms', 'Forms'], ['/owner/merch', 'Merch']] },
  { label: 'Commerce', items: [['/owner/inventory', 'Inventory'], ['/owner/orders', 'Orders'], ['/owner/commerce', 'Payments'], ['/owner/checkout-test', 'Checkout Test']] },
  { label: 'Operations', items: [['/owner/publish-requests', 'Approvals'], ['/owner/support', 'Support'], ['/owner/operations', 'Operations'], ['/owner/settings', 'Settings']] },
]

const clientGroups = [
  {
    label: 'My Website',
    items: [
      ['/client', 'Home'],
      ['/client/editor', 'Edit Website', 'canEdit'],
      ['/client/branding', 'Branding', 'canManageMedia'],
      ['/client/merch', 'Merch', 'canEdit'],
      ['/client/orders', 'Orders', 'canEdit'],
    ],
  },
  { label: 'Account', items: [['/client/publish', 'Updates', 'canRequestUpdates'], ['/client/support', 'Help', 'canViewSupport']] },
]

export function Logo() {
  return <div className="logo brandLogo"><img src="/ksj-digital-logo.svg" alt="KSJ Digital" /></div>
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
              {items.map(([path, label]) => <button className={current === path ? 'active' : ''} key={path} onClick={() => go(path)}><span>{label}</span></button>)}
            </div>
          )
        })}
      </nav>
      <div className="supportBox">
        <b>{client ? 'Your Website' : 'KSJ Digital Control'}</b>
        <p>{client ? 'Manage only the websites assigned to your account.' : 'Manage the KSJ Digital platform and all assigned websites.'}</p>
        <button onClick={() => go(client ? '/client/editor' : '/owner/websites')}>{client ? 'Edit Website' : 'Manage Websites'}</button>
      </div>
    </aside>
  )
}

export function Header({ client = false, title, account }) {
  const activeAccount = account || getAccountFromPath() || { displayName: 'KSJ Digital', roleLabel: 'Platform Owner' }
  const displayName = activeAccount.displayName || activeAccount.name || 'KSJ Digital'
  const roleLabel = activeAccount.roleLabel || (client ? 'Website Owner' : 'Platform Owner')

  return (
    <header className="header">
      <div>
        <span>{client ? roleLabel : 'KSJ Digital Platform'}</span>
        <h1>{title || displayName} 👋</h1>
        <p>{client ? 'Manage your assigned website and submit changes for approval.' : 'Manage websites, access, approvals and platform settings.'}</p>
      </div>
      <div className="tools">
        <button onClick={() => go(client ? '/client/settings' : '/owner/settings')}>
          {displayName}
          <span className="miniAvatar">{displayName?.[0] || 'K'}</span>
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
