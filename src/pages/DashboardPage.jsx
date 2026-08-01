import {
  ActivityPanel,
  PublishPanel,
  QuickActions,
  SkeletonCard,
  SkeletonList,
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

function liveUrl(domain = '') {
  if (!domain) return ''
  return domain.startsWith('http') ? domain : `https://${domain}`
}

function clientActions(account) {
  return [
    {
      icon: '✏️',
      title: 'Edit Website',
      description: 'Open your website editor, click the content you want to change and submit it for approval.',
      button: 'Open Editor',
      path: '/client/editor',
      allowed: account?.canEdit,
    },
    {
      icon: '🛍️',
      title: 'Manage Merch',
      description: 'Add products, images, prices, options and stock from one visual merch workspace.',
      button: 'Open Merch',
      path: '/client/merch',
      allowed: account?.canEdit,
    },
    {
      icon: '📦',
      title: 'View Orders',
      description: 'See orders for your website and keep track of fulfilment from one place.',
      button: 'View Orders',
      path: '/client/orders',
      allowed: account?.canEdit,
    },
    {
      icon: '✅',
      title: 'Submitted Updates',
      description: 'Check the status of website changes you have sent to KSJ Digital for approval.',
      button: 'View Updates',
      path: '/client/publish',
      allowed: account?.canRequestUpdates,
    },
    {
      icon: '💬',
      title: 'Get Help',
      description: 'Contact KSJ Digital when you need support with your website or portal access.',
      button: 'Open Help',
      path: '/client/support',
      allowed: account?.canViewSupport,
    },
  ].filter(action => action.allowed)
}

function ClientDashboardLoading() {
  return (
    <Layout client title="My Website">
      <div className="clientHome">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <section className="clientActionGrid" aria-label="Loading dashboard actions" aria-busy="true">
          {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} lines={3} />)}
        </section>
        <section className="clientBottomGrid" aria-label="Loading dashboard details" aria-busy="true">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </section>
      </div>
    </Layout>
  )
}

function OwnerDashboardLoading() {
  return (
    <Layout title="Dashboard">
      <div className="stats" aria-label="Loading dashboard statistics" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} lines={2} />)}
      </div>
      <div className="singleGrid">
        <section className="card websites">
          <SkeletonList rows={3} />
        </section>
      </div>
      <div className="bottom four" aria-label="Loading dashboard panels" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} lines={4} />)}
      </div>
      <SkeletonCard lines={2} className="quick" />
    </Layout>
  )
}

function ClientDashboard({ account, website }) {
  const actions = clientActions(account)
  const domain = liveUrl(website?.domain)

  return (
    <Layout client title={website?.name || 'My Website'}>
      <div className="clientHome">
        <section className="card clientWelcome">
          <div>
            <span className="clientStatus">{website?.status || 'Website assigned'}</span>
            <h2>Welcome back, {account?.name || 'Client'}.</h2>
            <p>Everything you can manage for {website?.name || 'your website'} is available here.</p>
          </div>
          <div className="clientWelcomeActions">
            {domain && <button onClick={() => window.open(domain, '_blank')}>View Live Website</button>}
            {account?.canEdit && <button onClick={() => (location.href = '/client/editor')}>Edit Website</button>}
          </div>
        </section>

        <section className="card clientSiteSummary">
          <div className="clientSiteMark">{website?.logo || website?.name?.slice(0, 3).toUpperCase() || 'WEB'}</div>
          <div>
            <h3>{website?.name || 'Assigned Website'}</h3>
            <p>{website?.domain || 'Domain not connected yet'}</p>
          </div>
          <div className="clientSiteButtons">
            {account?.canEdit && <button onClick={() => (location.href = '/client/editor')}>Manage</button>}
            {domain && <button onClick={() => window.open(domain, '_blank')}>Open Live Site</button>}
          </div>
        </section>

        <section className="clientActionGrid">
          {actions.map(action => (
            <article className="card clientActionCard" key={action.title}>
              <span className="clientActionIcon">{action.icon}</span>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
              <button onClick={() => (location.href = action.path)}>{action.button}</button>
            </article>
          ))}
        </section>

        <section className="clientBottomGrid">
          <article className="card clientUpdateCard">
            <h2>How website changes work</h2>
            <p>You make changes in the portal and preview them before anything reaches the live website.</p>
            <div className="clientSimpleSteps">
              <span>1. Edit your website</span>
              <span>2. Preview your changes</span>
              <span>3. Submit for approval</span>
              <span>4. KSJ Digital reviews and publishes</span>
            </div>
          </article>
          <article className="card clientHelpCard">
            <h2>Need help?</h2>
            <p>Open a support request and explain what you need. You do not need to understand the technical side.</p>
            {account?.canViewSupport && <button onClick={() => (location.href = '/client/support')}>Contact KSJ Digital</button>}
          </article>
        </section>
      </div>
    </Layout>
  )
}

export function DashboardPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites, status: websiteStatus } = useWebsites()
  const { clients, status: clientStatus } = useClients(!client)
  const website = findClientWebsite(websites, account)

  if (client && websiteStatus === 'Loading') return <ClientDashboardLoading />
  if (client) return <ClientDashboard account={account} website={website} />
  if (websiteStatus === 'Loading' || clientStatus === 'Loading') return <OwnerDashboardLoading />

  const stats = ownerStats(websites, clients)

  return (
    <Layout title="Dashboard">
      <div className="stats">
        {stats.map(item => (
          <Stat key={item[0]} item={item} />
        ))}
      </div>

      <div className="singleGrid">
        <section className="card websites">
          <div className="panelHead">
            <h2>Client Websites</h2>
            <button onClick={() => (location.href = '/owner/websites')}>Manage Websites</button>
          </div>
          {websites.map((site, index) => (
            <WebsiteCard key={site.id || site.name} site={site} active={index === 0} account={account} />
          ))}
        </section>
      </div>

      <div className="bottom four">
        <ActivityPanel />
        <PublishPanel account={account} />
        <TicketPanel account={account} />
        <StatusPanel />
      </div>

      <QuickActions account={account} />
    </Layout>
  )
}
