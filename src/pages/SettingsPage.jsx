import { useState } from 'react'
import { getAccountFromPath } from '../services/auth.js'
import { findClientWebsite, useWebsites } from '../hooks/useWebsites.js'
import { Layout } from '../layouts/Shell.jsx'

export function SettingsPage({ client = false }) {
  const account = getAccountFromPath()
  const { websites } = useWebsites()
  const website = findClientWebsite(websites, account)
  const [notice, setNotice] = useState('Ready')

  return (
    <Layout client={client} title="Settings">
      <section className="settingsHero card">
        <div>
          <span>Settings</span>
          <h2>{client ? 'Website Settings' : 'KSJ Digital Settings'}</h2>
          <p>
            {client
              ? 'Manage your website preferences and notification settings.'
              : 'Manage portal preferences and operational defaults.'}
          </p>
        </div>
        <button onClick={() => setNotice('Settings saved')}>{notice}</button>
      </section>

      <section className="card settingsForm">
        <div className="panelHead">
          <h2>Details</h2>
          <button onClick={() => setNotice('Settings saved')}>Update</button>
        </div>
        <label>
          {client ? 'Website Name' : 'Business Name'}
          <input defaultValue={client ? website?.name || 'Website' : 'KSJ Digital'} />
        </label>
        <label>
          Email
          <input defaultValue={account?.email || 'support@ksjdigital.co.uk'} />
        </label>
        <label>
          Notifications
          <select defaultValue="Email and portal notifications">
            <option>Email and portal notifications</option>
            <option>Portal only</option>
            <option>Important only</option>
          </select>
        </label>
      </section>
    </Layout>
  )
}
