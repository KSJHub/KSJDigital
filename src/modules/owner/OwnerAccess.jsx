import { Layout } from '../../layouts/Shell.jsx'

const clientRows = [
  ['TwoToneTaj', 'Taj', 'Premium', 'Active', 'TwoToneTaj', 'Client'],
  ['KSJ Diamond Gaming', 'Morgan', 'Launch', 'Preparing', 'KSJ Diamond Gaming', 'Owner managed'],
  ['Goliath', 'Goliath Admin', 'Build', 'In progress', 'Goliath', 'Client'],
]

const userRows = [
  ['Morgan', 'Owner', 'All websites', 'Active'],
  ['Taj', 'Client', 'TwoToneTaj only', 'Invited'],
  ['Goliath Admin', 'Client', 'Goliath only', 'Draft'],
]

const roles = [
  ['Owner', 'Everything', 'Create clients, assign websites, publish changes and manage KSJ Digital.'],
  ['Admin', 'Management', 'Manage websites, clients, media and support.'],
  ['Client', 'Assigned website only', 'Edit allowed content, upload media and request publish.'],
  ['Viewer', 'Read only', 'View assigned dashboard and analytics only.'],
]

export function OwnerAccess() {
  return <Layout title="Clients & Access"><section className="moduleHero card"><div><span>Owner Management</span><h2>Clients & Access</h2><p>Create client accounts, assign websites, control permissions and manage who can access each website.</p></div><button>Add Client</button></section><div className="ownerAccessGrid"><section className="card accessPanel wide"><div className="panelHead"><h2>Client Accounts</h2><button>Create Client</button></div>{clientRows.map(row => <article className="accessRow" key={row[0]}><div><b>{row[0]}</b><small>Contact: {row[1]} · Plan: {row[2]}</small></div><span>{row[3]}</span><small>{row[4]}</small><button>Manage</button></article>)}</section><section className="card accessPanel"><div className="panelHead"><h2>Invite User</h2><button>Send Invite</button></div><label>Name<input placeholder="Client name" /></label><label>Role<select><option>Client</option><option>Viewer</option><option>Admin</option></select></label><label>Website<select><option>TwoToneTaj</option><option>Goliath</option><option>KSJ Diamond Gaming</option></select></label></section></div><div className="ownerAccessGrid"><section className="card accessPanel"><div className="panelHead"><h2>Users</h2><button>Manage Users</button></div>{userRows.map(row => <article className="simpleAccessRow" key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><small>{row[2]}</small><em>{row[3]}</em></article>)}</section><section className="card accessPanel wide"><div className="panelHead"><h2>Permission Roles</h2><button>Edit Roles</button></div>{roles.map(row => <article className="roleRow" key={row[0]}><b>{row[0]}</b><span>{row[1]}</span><p>{row[2]}</p></article>)}</section></div><section className="card accessPanel"><div className="panelHead"><h2>Website Assignment Rules</h2><button>Save Rules</button></div><div className="ruleGrid"><span>Clients can only see websites assigned to them.</span><span>Clients can request publish, but cannot directly deploy.</span><span>Owner/Admin can approve and publish changes.</span><span>Viewer accounts are read-only.</span></div></section></Layout>
}
