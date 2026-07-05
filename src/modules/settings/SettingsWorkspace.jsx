import { Layout } from '../../layouts/Shell.jsx'

const clientSettings = [
  ['Profile', 'Manage your name, contact details and portal profile.'],
  ['Website Details', 'Update basic website information and public contact details.'],
  ['Brand Settings', 'Manage logo, colours, social links and default website wording.'],
  ['Notifications', 'Choose when KSJ Digital should notify you.'],
  ['Publishing', 'Control draft reminders and publish request preferences.'],
  ['Billing & Plan', 'View your current plan and account status.'],
]

const ownerSettings = [
  ['Platform Profile', 'Manage KSJ Digital platform identity and global settings.'],
  ['Security', 'Owner/admin security and access rules.'],
  ['Client Defaults', 'Default permissions for new client accounts.'],
  ['Publishing Rules', 'Approval, review and deployment rules.'],
  ['Notifications', 'Owner/admin alerts for publish requests and support.'],
  ['Integrations', 'GitHub, deployment, analytics and future billing services.'],
]

const audit = [
  ['Publish request created', 'TwoToneTaj', 'Today'],
  ['Media item uploaded', 'TwoToneTaj', 'Yesterday'],
  ['Client invite prepared', 'Goliath', '2 days ago'],
]

export function SettingsWorkspace({ client = false }) {
  const settings = client ? clientSettings : ownerSettings
  return <Layout client={client} title="Settings"><section className="settingsHero card"><div><span>{client ? 'Client Settings' : 'Owner Settings'}</span><h2>{client ? 'Your Portal Settings' : 'KSJ Digital Settings'}</h2><p>{client ? 'Manage your account, website preferences and notifications.' : 'Control platform settings, client defaults and publishing rules.'}</p></div><button>Save Changes</button></section><div className="settingsGrid enhanced">{settings.map((item, index) => <section className="card settingCard" key={item[0]}><span>0{index + 1}</span><h2>{item[0]}</h2><p>{item[1]}</p><button>Open Settings</button></section>)}</div><div className="settingsLayout"><section className="card settingsForm"><div className="panelHead"><h2>{client ? 'Website Preferences' : 'Platform Controls'}</h2><button>Update</button></div><label>{client ? 'Website Name' : 'Platform Name'}<input defaultValue={client ? 'TwoToneTaj' : 'KSJ Digital'} /></label><label>{client ? 'Public Tagline' : 'Support Contact'}<input defaultValue={client ? 'Average gamer. Legendary vibes.' : 'support@ksjdigital.co.uk'} /></label><label>{client ? 'Publish Preference' : 'Default Client Permission'}<select><option>{client ? 'Request approval before publish' : 'Client can request publish only'}</option><option>Read only</option><option>Admin managed</option></select></label><label>Notifications<select><option>Email and portal notifications</option><option>Portal only</option><option>Muted</option></select></label></section><section className="card auditPanel"><div className="panelHead"><h2>Recent Account Activity</h2><button>View All</button></div>{audit.map(row => <article key={`${row[0]}-${row[1]}`}><div><b>{row[0]}</b><small>{row[1]}</small></div><span>{row[2]}</span></article>)}</section></div></Layout>
}
