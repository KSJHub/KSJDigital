export function WebsiteCard({ site, active = false }) {
  return <article className={active ? 'website activeSite' : 'website'}><div className="thumb">{site.logo}</div><div><h3>{site.name} <em>{site.status}</em></h3><p>{site.domain} · {site.plan}</p><div className="siteStats"><b>{site.pages}<small>Pages</small></b><b>{site.media}<small>Media</small></b><b>{site.visits}<small>Visits</small></b><b>{site.seo}%<small>SEO</small></b><b>{site.performance}%<small>Speed</small></b></div></div><button>Manage</button></article>
}
