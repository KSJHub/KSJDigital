import { pages } from '../../services/mockData.js'
import { Layout } from '../../layouts/Shell.jsx'

const sections = [
  ['Hero', 'Main title, subtitle, button and hero image', 'Ready'],
  ['About panel', 'Short introduction shown on the homepage', 'Ready'],
  ['Live schedule', 'Streaming days and times', 'Needs review'],
  ['Social links', 'Twitch, YouTube, TikTok, Kick and Instagram', 'Ready'],
  ['SEO', 'Search title and page description', 'Draft'],
]

export function EditorWorkspace({ client = false }) {
  return <Layout client={client} title="Pages / Editor"><section className="editorTopbar card"><div><span>Editing</span><h2>Homepage</h2><p>Change the content your visitors see. Layout and design stay protected by KSJ Digital.</p></div><div><button>Save Draft</button><button>Request Publish</button></div></section><section className="editorGrid advanced"><div className="card pageList"><div className="panelHead"><h2>Pages</h2><button>Add Page</button></div>{pages.map((page, index) => <button className={index === 0 ? 'selected' : ''} key={page}>{page}<small>{index < 5 ? 'Published' : 'Draft'}</small></button>)}</div><div className="card sectionList"><div className="panelHead"><h2>Sections</h2><button>Preview</button></div>{sections.map(section => <article key={section[0]}><div><b>{section[0]}</b><small>{section[1]}</small></div><span>{section[2]}</span></article>)}</div><div className="card editorPanel"><div className="panelHead"><h2>Content Fields</h2><button>Unsaved</button></div><label>Hero Title<input defaultValue="TwoToneTaj" /></label><label>Hero Subtitle<input defaultValue="Average gamer. Legendary vibes." /></label><label>Intro Text<textarea defaultValue="TwoToneTaj, an average gamer with a passion for games, good laughs, and an awesome community." /></label><label>Primary Button<input defaultValue="Join The Squad" /></label><label>Button Link<input defaultValue="https://discord.gg/taj" /></label><div className="editorActions"><button>Discard</button><button>Save Draft</button></div></div></section><section className="editorPreviewGrid"><div className="card protectedNotice"><h2>Protected Design</h2><p>Clients can edit safe content fields only. Fonts, layout, spacing, core styling and page structure remain controlled by KSJ Digital.</p></div><div className="card clientPreview"><div className="mockNav"><b>TAJ</b><span>HOME</span><span>ABOUT</span><span>COMMUNITY</span><span>MERCH</span></div><div className="mockHero compact"><p>WELCOME TO</p><h2>TWOTONE<span>TAJ</span></h2><h4>Average gamer. Legendary vibes.</h4><button>JOIN THE SQUAD</button></div></div></section></Layout>
}
