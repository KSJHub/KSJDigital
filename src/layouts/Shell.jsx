import { getAccountFromPath, signOut } from '../services/auth.js'
import { PermissionBanner } from '../components/UI.jsx'
import { workspaceGroups } from '../services/workspacePolicy.js'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function go(path) {
  location.href = path
}

export function Logo() {
  return <div className="logo brandLogo"><img src="/ksj-digital-logo.svg" alt="KSJ Digital" /></div>
}

export function Sidebar({ client = false, account = null }) {
  const groups = workspaceGroups({ client, account })
  const current = route()

  return (
    <aside className={client ? 'sidebar clientSidebar' : 'sidebar'}>
      <Logo />
      <nav>
        {groups.map(group => (
          <div className="navGroup" key={group.label}>
            <div className="navGroupLabel">{group.label}</div>
            {group.items.map(item => (
              <button className={current === item.path ? 'active' : ''} key={item.path} onClick={() => go(item.path)}>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="supportBox">
        <b>{client ? 'Your Workspace' : 'KSJ Digital Control'}</b>
        <p>{client ? 'Manage your website, business tools and support in one place.' : 'Manage the KSJ Digital platform and all assigned websites.'}</p>
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
        <p>{client ? 'Manage your website and business workspace.' : 'Manage websites, access, approvals and platform settings.'}</p>
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
