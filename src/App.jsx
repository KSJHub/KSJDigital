import { AccessDenied } from './components/UI.jsx'
import { canAccessOwner, getAccountFromPath } from './services/auth.js'
import { LoginPage } from './pages/LoginPage.jsx'
import { OwnerSupportPage } from './pages/OwnerSupportPage.jsx'
import { OwnerWebsitesPage } from './pages/OwnerWebsitesPage.jsx'
import { ClientWebsitePage } from './pages/ClientWebsitePage.jsx'
import { ClientsPage, DashboardPage, EditorPage, MediaPage, PublishPage, SettingsPage, SupportPage } from './pages/Pages.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function Workspace({ client = false, type }) {
  if (!client && type === 'websites') return <OwnerWebsitesPage />
  if (!client && type === 'clients') return <ClientsPage />
  if (!client && type === 'publish-requests') return <PublishPage />
  if (!client && type === 'support') return <OwnerSupportPage />
  if (client && type === 'publish') return <PublishPage client />
  if (client && type === 'website') return <ClientWebsitePage />
  if (type === 'editor') return <EditorPage client={client} />
  if (type === 'media') return <MediaPage client={client} />
  if (type === 'support') return <SupportPage client={client} />
  if (type === 'settings') return <SettingsPage client={client} />
  return client ? <ClientWebsitePage /> : <OwnerWebsitesPage />
}

export default function App() {
  const path = route()
  const account = getAccountFromPath()
  if (path === '/login' || path === '/') return <LoginPage />
  if (!account) return <LoginPage />
  if (path.startsWith('/owner') && !canAccessOwner(account)) return <AccessDenied account={account} />
  if (path.startsWith('/client') && account.role === 'owner') return <Workspace client type="website" />
  if (path === '/owner') return <DashboardPage />
  if (path === '/client') return <DashboardPage client />
  if (path.startsWith('/owner/')) return <Workspace type={path.split('/')[2]} />
  if (path.startsWith('/client/')) return <Workspace client type={path.split('/')[2]} />
  return <LoginPage />
}
