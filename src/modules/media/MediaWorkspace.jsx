import { mediaItems } from '../../services/mockData.js'
import { Layout } from '../../layouts/Shell.jsx'

const folders = ['All Media', 'Homepage', 'About Page', 'Brand Assets', 'Social Graphics', 'Unused']
const storageCards = [
  ['Storage Used', '1.8 GB', 'of 10 GB included'],
  ['Images', '842', 'website-ready assets'],
  ['Used Files', '124', 'currently used on pages'],
  ['Optimised', '98%', 'safe for performance'],
]

export function MediaWorkspace({ client = false }) {
  return <Layout client={client} title="Media Library"><section className="mediaHero card"><div><span>Website Media</span><h2>Manage Images & Assets</h2><p>Upload and organise images used across your website. KSJ Digital keeps files optimised for your live pages.</p></div><button>Upload Media</button></section><div className="mediaStats">{storageCards.map(card => <article className="card mediaStat" key={card[0]}><span>{card[0]}</span><strong>{card[1]}</strong><small>{card[2]}</small></article>)}</div><section className="mediaWorkspace"><aside className="card mediaFolders"><h2>Folders</h2>{folders.map((folder, index) => <button className={index === 0 ? 'active' : ''} key={folder}>{folder}<small>{index === 0 ? mediaItems.length : Math.max(1, mediaItems.length - index)}</small></button>)}</aside><div><section className="card uploadZone advancedUpload"><h2>Upload Area</h2><p>Add banners, avatars, logos, thumbnails and website graphics.</p><div><button>Choose Files</button><button>Open Library</button></div></section><div className="mediaToolbar"><div className="search">Search media...</div><button>Grid View</button><button>Filter</button><button>Sort</button></div><div className="mediaGrid advancedMedia">{mediaItems.map((item, index) => <article className="card mediaItem" key={item}><div>{item.split('.')[0].slice(0, 2).toUpperCase()}</div><b>{item}</b><small>{index % 2 ? 'Used on Homepage' : 'Brand Asset'}</small><p>{index % 3 === 0 ? 'Hero or page content' : index % 3 === 1 ? 'Brand image' : 'Social or stream asset'}</p><footer><button>Preview</button><button>Use</button></footer></article>)}</div></div></section></Layout>
}
