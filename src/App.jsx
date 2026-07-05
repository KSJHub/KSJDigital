import { Dashboard } from './modules/dashboard/Dashboard.jsx'
import { EditorWorkspace } from './modules/editor/EditorWorkspace.jsx'
import { MediaWorkspace } from './modules/media/MediaWorkspace.jsx'
import { SupportWorkspace } from './modules/support/SupportWorkspace.jsx'
import { SettingsWorkspace } from './modules/settings/SettingsWorkspace.jsx'
import { ModulePage } from './modules/core/ModulePage.jsx'
import { ClientWebsiteWorkspace } from './modules/client/ClientWebsiteWorkspace.jsx'
import { OwnerAccess } from './modules/owner/OwnerAccess.jsx'
import { PublishRequests } from './modules/publishing/PublishRequests.jsx'
import { Logo } from './layouts/Shell.jsx'

function route() {
  return location.pathname.replace(/\/$/, '') || '/'
}

function Login() {
  return <div className="login"><div className="card loginCard"><Logo /><h1>KSJ Digital Ecosystem</h1><p>The central hub for managing websites, content, media, analytics and support.</p><a href="/owner">Open Owner Platform</a><a href="/client">Open Client Portal</a></div></div>
}

function Workspace({ client = false, type }) {
  if (!client && type === 'clients') return <OwnerAccess />
  if (!client && type === 'publish-requests') return <PublishRequests />
  if (client && type === 'publish') return <PublishRequests client />
  if (client && type === 'website') return <ClientWebsiteWorkspace />
  if (type === 'editor') return <EditorWorkspace client={client} />
  if (type === 'media') return <MediaWorkspace client={client} />
  if (type === 'support') return <SupportWorkspace client={client} />
  if (type === 'settings') return <SettingsWorkspace client={client} />
  return <ModulePage client={client} type={type === 'website' ? 'websites' : type} />
}

export default function App() {
  const path = route()
  if (path === '/owner') return <Dashboard />
  if (path === '/client') return <Dashboard client />
  if (path.startsWith('/owner/')) return <Workspace type={path.split('/')[2]} />
  if (path.startsWith('/client/')) return <Workspace client type={path.split('/')[2]} />
  return <Login />
}
