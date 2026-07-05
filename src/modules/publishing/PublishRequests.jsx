import { Layout } from '../../layouts/Shell.jsx'

const requests = [
  ['TwoToneTaj', 'Homepage hero update', 'Pending Review', 'Taj', 'Today'],
  ['TwoToneTaj', 'Community page copy', 'Draft Saved', 'Taj', 'Yesterday'],
  ['Goliath', 'Launch page wording', 'Client Editing', 'Goliath Admin', '2 days ago'],
]

const stages = ['Draft saved', 'Review requested', 'Owner approved', 'Published live']

export function PublishRequests({ client = false }) {
  const visibleRequests = client ? requests.filter(row => row[0] === 'TwoToneTaj') : requests
  return <Layout client={client} title="Publish Requests"><section className="moduleHero card"><div><span>{client ? 'Client Publishing' : 'Owner Review'}</span><h2>{client ? 'Request Website Updates' : 'Review & Publish Changes'}</h2><p>{client ? 'Save website edits, preview changes, then request KSJ Digital to publish them live.' : 'Review client changes, approve safe updates, and publish them to the correct website.'}</p></div><button>{client ? 'Request Publish' : 'Review Queue'}</button></section><div className="publishGrid"><section className="card publishPanel wide"><div className="panelHead"><h2>{client ? 'My Requests' : 'Client Requests'}</h2><button>{client ? 'New Request' : 'Approve Selected'}</button></div>{visibleRequests.map(row => <article className="publishRow" key={`${row[0]}-${row[1]}`}><div><b>{row[1]}</b><small>{row[0]} · Requested by {row[3]} · {row[4]}</small></div><span>{row[2]}</span>{!client && <button>Review</button>}</article>)}</section><section className="card publishPanel"><div className="panelHead"><h2>Publish Safety</h2><button>Settings</button></div><div className="safetyList"><span>Clients cannot deploy directly.</span><span>Owner approval required before live publish.</span><span>Changes are mapped to safe content fields.</span><span>Website layout and code stay protected.</span></div></section></div><section className="card publishPanel"><div className="panelHead"><h2>Publishing Workflow</h2><button>View History</button></div><div className="publishSteps ownerSteps">{stages.map((stage, index) => <span key={stage}><b>0{index + 1}</b>{stage}</span>)}</div></section></Layout>
}
