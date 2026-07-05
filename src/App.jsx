import { Dashboard } from './modules/dashboard/Dashboard.jsx'
import { EditorWorkspace } from './modules/editor/EditorWorkspace.jsx'
import { MediaWorkspace } from './modules/media/MediaWorkspace.jsx'
import { SupportWorkspace } from './modules/support/SupportWorkspace.jsx'
import { SettingsWorkspace } from './modules/settings/SettingsWorkspace.jsx'
import { ModulePage } from './modules/core/ModulePage.jsx'
import { ClientWebsiteWorkspace } from './modules/client/ClientWebsiteWorkspace.jsx'
import { OwnerAccess } from './modules/owner/OwnerAccess.jsx'
import { OwnerWebsiteInspector } from './modules/owner/OwnerWebsiteInspector.jsx'
import { PublishRequests } from './modules/publishing/PublishRequests.jsx'
import { AnalyticsWorkspace } from './modules/analytics/AnalyticsWorkspace.jsx'
import { WebsitesWorkspace } from './modules/websites/WebsitesWorkspace.jsx'
import { DeploymentWorkspace } from './modules/deployments/DeploymentWorkspace.jsx'
import { IntegrationsWorkspace } from './modules/integrations/IntegrationsWorkspace.jsx'
import { LoginWorkspace } from './modules/auth/LoginWorkspace.jsx'
import { AccessDenied } from './components/PermissionBanner.jsx'
import { canAccessOwner, getAccountFromPath } from './services/auth.js'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function Workspace({ client = false, type }) {
  if (!client && type === 'websites') return <WebsitesWorkspace />
  if (!client && type === 'website-inspector') return <OwnerWebsiteInspector />
  if (!client && type === 'clients') return <OwnerAccess />
  if (!client && type === 'publish-requests') return <PublishRequests />
  if (!client && type === 'deployments') return <DeploymentWorkspace />
  if (!client && type === 'integrations') return <IntegrationsWorkspace />
  if (client && type === 'publish') return <PublishRequests client />
  if (client && type === 'website') return <ClientWebsiteWorkspace />
  if (type === 'analytics') return <AnalyticsWorkspace client={client} />
  if (type === 'editor') return <EditorWorkspace client={client} />
  if (type === 'media') return <MediaWorkspace client={client} />
  if (type === 'support') return <SupportWorkspace client={client} />
  if (type === 'settings') return <SettingsWorkspace client={client} />
  return <ModulePage client={client} type={type === 'website' ? 'websites' : type} />
}

export default function App() {
  const path = route()
  const account = getAccountFromPath()
  if (path === '/login' || path === '/') return <LoginWorkspace />
  if (path.startsWith('/owner') && !canAccessOwner(account)) return <AccessDenied account={account} />
  if (path === '/owner') return <Dashboard />
  if (path === '/client') return <Dashboard client />
  if (path.startsWith('/owner/')) return <Workspace type={path.split('/')[2]} />
  if (path.startsWith('/client/')) return <Workspace client type={path.split('/')[2]} />
  return <LoginWorkspace />
}
