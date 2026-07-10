import { useEffect, useState } from 'react'
import { AccessDenied } from './components/UI.jsx'
import { canAccessOwner, getAccountFromPath, refreshSession } from './services/auth.js'
import { LoginPage } from './pages/LoginPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { OwnerSupportPage } from './pages/OwnerSupportPage.jsx'
import { OwnerWebsitesPage } from './pages/OwnerWebsitesPage.jsx'
import { OwnerClientsPage } from './pages/OwnerClientsPage.jsx'
import { ClientWebsitePage } from './pages/ClientWebsitePage.jsx'
import { BrandCentrePage } from './pages/BrandCentrePage.jsx'
import { CommerceSettingsPage } from './pages/CommerceSettingsPage.jsx'
import { PublishPipelinePage } from './pages/PublishPipelinePage.jsx'
import { PageBuilderPage } from './pages/PageBuilderPage.jsx'
import { SiteEnginePage } from './pages/SiteEnginePage.jsx'
import { MediaLibraryPage } from './pages/MediaLibraryPage.jsx'
import { FormBuilderPage } from './pages/FormBuilderPage.jsx'
import { MerchManagerPage } from './pages/MerchManagerPage.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'
import { OperationsPage } from './pages/OperationsPage.jsx'
import { ReleaseCentrePage } from './pages/ReleaseCentrePage.jsx'
import { SettingsPage } from './pages/SettingsPage.jsx'
import { SupportPage } from './pages/SupportPage.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function canAccessClientRoute(account, type) {
  if (!account || account.role === 'owner') return true
  if (['editor', 'engine', 'forms', 'merch', 'orders', 'commerce'].includes(type)) return !!account.canEdit
  if (['media', 'branding'].includes(type)) return !!account.canManageMedia
  if (type === 'publish') return !!account.canRequestUpdates
  if (type === 'support') return !!account.canViewSupport
  return true
}

function Workspace({ client = false, type }) {
  if (!client && type === 'websites') return <OwnerWebsitesPage />
  if (!client && type === 'clients') return <OwnerClientsPage />
  if (!client && type === 'branding') return <BrandCentrePage />
  if (!client && type === 'engine') return <SiteEnginePage />
  if (!client && type === 'forms') return <FormBuilderPage />
  if (!client && type === 'merch') return <MerchManagerPage />
  if (!client && type === 'orders') return <OrdersPage />
  if (!client && type === 'commerce') return <CommerceSettingsPage />
  if (!client && type === 'operations') return <OperationsPage />
  if (!client && type === 'launch') return <ReleaseCentrePage />
  if (!client && type === 'publish-requests') return <PublishPipelinePage />
  if (!client && type === 'support') return <OwnerSupportPage />
  if (!client && type === 'editor') return <PageBuilderPage />
  if (!client && type === 'media') return <MediaLibraryPage />
  if (client && type === 'branding') return <BrandCentrePage client />
  if (client && type === 'engine') return <SiteEnginePage client />
  if (client && type === 'forms') return <FormBuilderPage client />
  if (client && type === 'merch') return <MerchManagerPage client />
  if (client && type === 'orders') return <OrdersPage client />
  if (client && type === 'commerce') return <CommerceSettingsPage client />
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
  const [account, setAccount] = useState(getAccountFromPath())
  const [sessionChecked, setSessionChecked] = useState(path === '/login' || path === '/')

  useEffect(() => {
    if (path === '/login' || path === '/') return

    let cancelled = false

    refreshSession().then(serverAccount => {
      if (!cancelled) {
        setAccount(serverAccount)
        setSessionChecked(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [path])

  if (path === '/login' || path === '/') return <LoginPage />
  if (!sessionChecked) return <LoginPage />
  if (!account) return <LoginPage />
  if (path.startsWith('/owner') && !canAccessOwner(account)) {
    return <AccessDenied account={account} />
  }
  if (path === '/owner') return <DashboardPage />
  if (path === '/client') return <DashboardPage client />
  if (path.startsWith('/owner/')) return <Workspace type={path.split('/')[2]} />
  if (path.startsWith('/client/')) {
    const type = path.split('/')[2]
    if (!canAccessClientRoute(account, type)) return <AccessDenied account={account} />
    return <Workspace client type={type} />
  }
  return <LoginPage />
}
