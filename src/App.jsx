import { AccessDenied } from './components/UI.jsx'
import { canAccessOwner, getAccountFromPath } from './services/auth.js'
import { LoginPage } from './pages/LoginPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { OwnerSupportPage } from './pages/OwnerSupportPage.jsx'
import { OwnerWebsitesPage } from './pages/OwnerWebsitesPage.jsx'
import { OwnerClientsPage } from './pages/OwnerClientsPage.jsx'
import { ClientWebsitePage } from './pages/ClientWebsitePage.jsx'
import { BrandCentrePage } from './pages/BrandCentrePage.jsx'
import { PublishPipelinePage } from './pages/PublishPipelinePage.jsx'
import { PageBuilderPage } from './pages/PageBuilderPage.jsx'
import { SiteEnginePage } from './pages/SiteEnginePage.jsx'
import { MediaLibraryPage } from './pages/MediaLibraryPage.jsx'
import { FormBuilderPage } from './pages/FormBuilderPage.jsx'
import { OperationsPage } from './pages/OperationsPage.jsx'
import { ReleaseCentrePage } from './pages/ReleaseCentrePage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { SupportPage } from './pages/SupportPage.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function Workspace({ client = false, type }) {
  if (!client && type === 'websites') return <OwnerWebsitesPage />
  if (!client && type === 'clients') return <OwnerClientsPage />
  if (!client && type === 'branding') return <BrandCentrePage />
  if (!client && type === 'engine') return <SiteEnginePage />
  if (!client && type === 'forms') return <FormBuilderPage />
  if (!client && type === 'operations') return <OperationsPage />
  if (!client && type === 'launch') return <ReleaseCentrePage />
  if (!client && type === 'publish-requests') return <PublishPipelinePage />
  if (!client && type === 'support') return <OwnerSupportPage />
  if (!client && type === 'editor') return <PageBuilderPage />
  if (!client && type === 'media') return <MediaLibraryPage />
  if (client && type === 'branding') return <BrandCentrePage client />
  if (client && type === 'engine') return <SiteEnginePage client />
  if (client && type === 'forms') return <FormBuilderPage client />
  if (client && type === 'operations') return <OperationsPage client />
  if (client && type === 'publish') return <PublishPipelinePage client />
  if (client && type === 'website') return <ClientWebsitePage />
  if (client && type === 'editor') return <PageBuilderPage client />
  if (client && type === 'media') return <MediaLibraryPage client />
  if (type === 'support') return <SupportPage client={client} />
  if (type === 'settings') return <SettingsPage client={client} />
  return client ? <ClientWebsitePage /> : <OwnerWebsitesPage />
}

export default function App() {
  const path = route()
  const account = getAccountFromPath()
  if (path === '/login' || path === '/') return <LoginPage />
  if (!account) return <LoginPage />
  if (path.startsWith('/owner') && !canAccessOwner(account))
    return <AccessDenied account={account} />
  if (path === '/owner') return <DashboardPage />
  if (path === '/client') return <DashboardPage client />
  if (path.startsWith('/owner/')) return <Workspace type={path.split('/')[2]} />
  if (path.startsWith('/client/')) return <Workspace client type={path.split('/')[2]} />
  return <LoginPage />
}
