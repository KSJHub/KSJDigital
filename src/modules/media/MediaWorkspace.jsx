import { mediaItems } from '../../services/mockData.js'
import { Layout } from '../../layouts/Shell.jsx'

export function MediaWorkspace({ client = false }) {
  return <Layout client={client} title="Media Library"><section className="card uploadZone"><h2>Drop files here</h2><p>Upload images, banners, overlays, icons and brand assets.</p><button>Upload Media</button></section><div className="mediaGrid">{mediaItems.map((item, index) => <div className="card mediaItem" key={item}><div>{item.split('.')[0].slice(0, 2).toUpperCase()}</div><b>{item}</b><small>{index % 2 ? 'Used on Homepage' : 'Brand Asset'}</small></div>)}</div></Layout>
}
