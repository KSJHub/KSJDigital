import { Layout } from '../../layouts/Shell.jsx'

export function SettingsWorkspace({ client = false }) {
  return <Layout client={client} title="Settings"><div className="settingsGrid">{['Profile','Security','Notifications','Brand Settings','Billing','Permissions'].map((item, index) => <section className="card settingCard" key={item}><span>0{index + 1}</span><h2>{item}</h2><p>Configure {item.toLowerCase()} for this KSJ Digital workspace.</p><button>Open Settings</button></section>)}</div></Layout>
}
