import { lazy, Suspense, useEffect, useState } from 'react'
import { AccessDenied } from './components/UI.jsx'
import { canAccessOwner, getAccountFromPath, refreshSession } from './services/auth.js'
import { canAccessClientWorkspace } from './services/workspacePolicy.js'

const PublicHomePage = lazy(() => import('./pages/PublicHomePage.jsx').then(module => ({ default: module.PublicHomePage })))
const LoginPage = lazy(() => import('./pages/LoginPage.jsx').then(module => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then(module => ({ default: module.DashboardPage })))
const OwnerSupportPage = lazy(() => import('./pages/OwnerSupportPage.jsx').then(module => ({ default: module.OwnerSupportPage })))
const OwnerWebsitesPage = lazy(() => import('./pages/OwnerWebsitesPage.jsx').then(module => ({ default: module.OwnerWebsitesPage })))
const OwnerClientsPage = lazy(() => import('./pages/OwnerClientsPage.jsx').then(module => ({ default: module.OwnerClientsPage })))
const ClientWebsitePage = lazy(() => import('./pages/ClientWebsitePage.jsx').then(module => ({ default: module.ClientWebsitePage })))
const SiteSettingsPage = lazy(() => import('./pages/SiteSettingsPage.jsx').then(module => ({ default: module.SiteSettingsPage })))
const CommerceSettingsV2Page = lazy(() => import('./pages/CommerceSettingsV2Page.jsx').then(module => ({ default: module.CommerceSettingsV2Page })))
const CheckoutTestPage = lazy(() => import('./pages/CheckoutTestPage.jsx').then(module => ({ default: module.CheckoutTestPage })))
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx').then(module => ({ default: module.InventoryPage })))
const PublishPipelinePage = lazy(() => import('./pages/PublishPipelinePage.jsx').then(module => ({ default: module.PublishPipelinePage })))
const PageBuilderPage = lazy(() => import('./pages/PageBuilderPage.jsx').then(module => ({ default: module.PageBuilderPage })))
const SiteEnginePage = lazy(() => import('./pages/SiteEnginePage.jsx').then(module => ({ default: module.SiteEnginePage })))
const MediaLibraryPage = lazy(() => import('./pages/MediaLibraryPage.jsx').then(module => ({ default: module.MediaLibraryPage })))
const FormBuilderPage = lazy(() => import('./pages/FormBuilderPage.jsx').then(module => ({ default: module.FormBuilderPage })))
const MerchManagerV2Page = lazy(() => import('./pages/MerchManagerV2Page.jsx').then(module => ({ default: module.MerchManagerV2Page })))
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx').then(module => ({ default: module.OrdersPage })))
const OperationsPage = lazy(() => import('./pages/OperationsPage.jsx').then(module => ({ default: module.OperationsPage })))
const ReleaseCentrePage = lazy(() => import('./pages/ReleaseCentrePage.jsx').then(module => ({ default: module.ReleaseCentrePage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx').then(module => ({ default: module.SettingsPage })))
const SupportPage = lazy(() => import('./pages/SupportPage.jsx').then(module => ({ default: module.SupportPage })))

function route() { return location.pathname.replace(/\/$/, '') || '/' }

function Workspace({ client = false, type }) {
  if (!client && type === 'websites') return <OwnerWebsitesPage />
  if (!client && type === 'clients') return <OwnerClientsPage />
  if (!client && type === 'branding') return <SiteSettingsPage />
  if (!client && type === 'engine') return <SiteEnginePage />
  if (!client && type === 'forms') return <FormBuilderPage />
  if (!client && type === 'merch') return <MerchManagerV2Page />
  if (!client && type === 'inventory') return <InventoryPage />
  if (!client && type === 'orders') return <OrdersPage />
  if (!client && type === 'commerce') return <CommerceSettingsV2Page />
  if (!client && type === 'checkout-test') return <CheckoutTestPage />
  if (!client && type === 'operations') return <OperationsPage />
  if (!client && type === 'launch') return <ReleaseCentrePage />
  if (!client && type === 'publish-requests') return <PublishPipelinePage />
  if (!client && type === 'support') return <OwnerSupportPage />
  if (!client && type === 'editor') return <PageBuilderPage />
  if (!client && type === 'media') return <MediaLibraryPage />
  if (client && type === 'branding') return <SiteSettingsPage client />
  if (client && type === 'engine') return <SiteEnginePage client />
  if (client && type === 'forms') return <FormBuilderPage client />
  if (client && type === 'merch') return <MerchManagerV2Page client />
  if (client && type === 'inventory') return <InventoryPage client />
  if (client && type === 'orders') return <OrdersPage client />
  if (client && type === 'commerce') return <CommerceSettingsV2Page client />
  if (client && type === 'operations') return <OperationsPage client />
  if (client && type === 'publish') return <PublishPipelinePage client />
  if (client && type === 'website') return <ClientWebsitePage />
  if (client && type === 'editor') return <PageBuilderPage client />
  if (client && type === 'media') return <MediaLibraryPage client />
  if (type === 'support') return <SupportPage client={client} />
  if (type === 'settings') return <SettingsPage client={client} />
  return client ? <ClientWebsitePage /> : <OwnerWebsitesPage />
}

function PageLoading() {
  return <main className="routeLoading" aria-live="polite"><div className="card"><strong>Loading workspace…</strong></div></main>
}

export default function App() {
  const path = route()
  const [account, setAccount] = useState(getAccountFromPath())
  const [sessionChecked, setSessionChecked] = useState(path === '/' || path === '/login')

  useEffect(() => {
    if (path === '/' || path === '/login') return
    let cancelled = false
    refreshSession().then(serverAccount => { if (!cancelled) { setAccount(serverAccount); setSessionChecked(true) } })
    return () => { cancelled = true }
  }, [path])

  let page
  if (path === '/') page = <PublicHomePage />
  else if (path === '/login') page = <LoginPage />
  else if (!sessionChecked || !account) page = <LoginPage />
  else if (path.startsWith('/owner') && !canAccessOwner(account)) page = <AccessDenied account={account} />
  else if (path === '/owner') page = <DashboardPage />
  else if (path === '/client') page = <DashboardPage client />
  else if (path.startsWith('/owner/')) page = <Workspace type={path.split('/')[2]} />
  else if (path.startsWith('/client/')) {
    const type = path.split('/')[2]
    page = canAccessClientWorkspace(account, type)
      ? <Workspace client type={type} />
      : <AccessDenied account={account} />
  } else page = <PublicHomePage />

  return <Suspense fallback={<PageLoading />}>{page}</Suspense>
}
