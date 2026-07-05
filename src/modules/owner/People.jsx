import { Layout } from '../../layouts/Shell.jsx'

const rows = [
  ['TwoToneTaj', 'Taj', 'TwoToneTaj', 'Active'],
  ['KSJ Diamond Gaming', 'Morgan', 'KSJ Diamond Gaming', 'Preparing'],
  ['Goliath', 'Admin', 'Goliath', 'Draft'],
]

export function People() {
  return <Layout title="Clients"><section className="moduleHero card"><div><span>Owner Management</span><h2>Clients</h2><p>Add accounts, assign websites, and manage website permissions.</p></div><button>Add</button></section><section className="card accessPanel"><div className="panelHead"><h2>Website Accounts</h2><button>Save</button></div>{rows.map(row => <article className="accessRow" key={row[0]}><div><b>{row[0]}</b><small>{row[1]} · {row[2]}</small></div><span>{row[3]}</span><small>Assigned website</small><button>Manage</button></article>)}</section></Layout>
}
