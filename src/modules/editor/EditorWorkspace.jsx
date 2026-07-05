import { pages } from '../../services/mockData.js'
import { Layout } from '../../layouts/Shell.jsx'

export function EditorWorkspace({ client = false }) {
  return <Layout client={client} title="Pages / Editor"><section className="editorGrid"><div className="card pageList"><div className="panelHead"><h2>Pages</h2><button>Add Page</button></div>{pages.map((page, index) => <button className={index === 0 ? 'selected' : ''} key={page}>{page}<small>{index < 5 ? 'Published' : 'Draft'}</small></button>)}</div><div className="card editorPanel"><div className="panelHead"><h2>Homepage Editor</h2><button>Save Draft</button></div><label>Hero Title<input defaultValue="TwoToneTaj" /></label><label>Subtitle<input defaultValue="Gaming community, streams and merch" /></label><label>Primary Button<input defaultValue="Join The Squad" /></label><label>SEO Description<input defaultValue="Average gamer. Community builder." /></label><div className="editorActions"><button>Preview</button><button>Publish Changes</button></div></div><section className="card editorPanel"><h2>Live Preview</h2><p>Preview panel prepared for the full website editor.</p></section></section></Layout>
}
