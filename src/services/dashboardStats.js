import {
  getClients,
  getClientWebsite,
  getMediaItems,
  getOwnerWebsites,
  getTickets,
  getUpdateRequests,
  getWebsitePages,
} from './platform.js'

export function getDashboardStats(isClient = false) {
  const websites = getOwnerWebsites()
  const people = getClients().filter(item => item.role !== 'Owner')
  const requests = getUpdateRequests()
  const openUpdates = requests.filter(item => item[2] !== 'Approved').length
  const site = getClientWebsite()

  if (isClient) {
    return [
      ['Website', site.status, 'Current status'],
      ['Pages', String(site.pageCount || getWebsitePages().length), 'Editable pages'],
      ['Media', String(site.mediaCount || getMediaItems().length), 'Website assets'],
      ['Updates', String(openUpdates), 'Awaiting review'],
    ]
  }

  return [
    ['Websites', String(websites.length), 'Managed client websites'],
    ['Clients', String(people.length), 'Active client accounts'],
    ['Updates', String(openUpdates), 'Waiting for review'],
    ['Support', String(getTickets().length), 'Open tickets'],
  ]
}
