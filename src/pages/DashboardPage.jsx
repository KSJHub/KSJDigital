import {
  ActivityPanel,
  Preview,
  PublishPanel,
  QuickActions,
  Stat,
  StatusPanel,
  TicketPanel,
  WebsiteCard,
} from '../components/UI.jsx'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { useClients } from '../hooks/useClients.js'
import { Layout } from '../layouts/Shell.jsx'

function ownerStats(websites, clients) {
  const clientCount = clients.filter(client => client.role !== 'Owner').length

  return [
    ['Websites', String(websites.length), 'Managed client websites'],
    ['Clients', String(clientCount), 'Active client accounts'],
    ['Updates', '0', 'Waiting for review'],
    ['Support', '0', 'Open tickets'],
  ]
}

function clientStats(website) {
  return [
    ['Website', website?.status || 'Unknown', 'Current status'],
    ['Pages', String(website?.pageCount || 0), 'Editable pages'],
    ['Media', String(website?.mediaCount || 0), 'Website assets'],
    ['Updates', '0', 'Awaiting review'],
  ]
}

export function DashboardPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const { clients } = useClients(!client)
  const website = findClientWebsite(websites, account)
  const visibleWebsites = client ? [website].filter(Boolean) : websites
  const stats = client ? clientStats(website) : ownerStats(websites, clients)

  return (
    <Layout client={client} title={client ? 'My Website' : 'Dashboard'}>
      <div className="stats">
        {stats.map(item => (
          <Stat key={item[0]} item={item} />
        ))}
      </div>

      <div className="singleGrid">
        <section className="card websites">
          <div className="panelHead">
            <h2>{client ? 'Your Website' : 'Client Websites'}</h2>
            <button onClick={() => (location.href = client ? '/client/website' : '/owner/websites')}>
              {client ? 'Manage Website' : 'Manage Websites'}
            </button>
          </div>
          {visibleWebsites.map((site, index) => (
            <WebsiteCard key={site.id || site.name} site={site} active={index === 0} client={client} />
          ))}
        </section>
        <Preview />
      </div>

      <div className="bottom four">
        <ActivityPanel />
        <PublishPanel />
        <TicketPanel />
        <StatusPanel />
      </div>

      <QuickActions client={client} />
    </Layout>
  )
}
