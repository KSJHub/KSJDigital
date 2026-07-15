const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 160

function resolvedImage(asset) {
  return asset?.resolvedUrl || asset?.url || ''
}

export function PageSeoPanel({
  pages = [],
  selectedPageId,
  onSelectPage,
  onUpdateSeo,
  imageAssets = [],
  website,
  canManagePages,
  saving,
}) {
  const page = pages.find(item => item.id === selectedPageId) || pages[0]

  if (!pages.length) {
    return (
      <section className="card settingsGroup pageSeoGroup">
        <div className="panelHead"><h2>Page SEO & Sharing</h2><span>No custom pages</span></div>
        <p className="pageManagerHelp">Create a custom page first. Its search and social-sharing settings will appear here.</p>
      </section>
    )
  }

  const seo = page.seo || {}
  const title = seo.title || ''
  const description = seo.description || ''
  const previewTitle = title.trim() || page.title || page.label || 'Untitled Page'
  const previewDescription = description.trim() || page.intro || 'Add a page description for search results and social sharing.'
  const previewImage = seo.image || ''
  const domain = String(website?.domain || '').replace(/\/$/, '')
  const pageUrl = `${domain || 'https://example.com'}/${page.slug}`

  function patch(changes, message) {
    if (!canManagePages || saving) return
    onUpdateSeo(page.id, { ...seo, ...changes }, message)
  }

  return (
    <section className={`card settingsGroup pageSeoGroup ${canManagePages ? '' : 'permissionLocked'}`}>
      <div className="panelHead">
        <div><h2>Page SEO & Sharing</h2><p>Control how a custom page appears in search results and when its link is shared.</p></div>
        <span>{canManagePages ? 'Managed per page' : '🔒 Locked by KSJ Digital'}</span>
      </div>

      <label>Choose page
        <select value={page.id} disabled={!canManagePages} onChange={event => onSelectPage(event.target.value)}>
          {pages.map(item => <option key={item.id} value={item.id}>{item.label || item.title} · /{item.slug}</option>)}
        </select>
      </label>

      <div className="seoEditorGrid">
        <div className="seoFields">
          <label>Search title
            <input
              disabled={!canManagePages}
              value={title}
              maxLength={90}
              placeholder={page.title || page.label}
              onChange={event => onUpdateSeo(page.id, { ...seo, title: event.target.value }, null, false)}
              onBlur={() => patch({ title }, 'SEO title saved')}
            />
            <small className={title.length > TITLE_LIMIT ? 'seoCount warning' : 'seoCount'}>{title.length}/{TITLE_LIMIT} recommended characters</small>
          </label>

          <label>Search description
            <textarea
              disabled={!canManagePages}
              value={description}
              maxLength={240}
              rows="4"
              placeholder={page.intro || 'Describe this page.'}
              onChange={event => onUpdateSeo(page.id, { ...seo, description: event.target.value }, null, false)}
              onBlur={() => patch({ description }, 'SEO description saved')}
            />
            <small className={description.length > DESCRIPTION_LIMIT ? 'seoCount warning' : 'seoCount'}>{description.length}/{DESCRIPTION_LIMIT} recommended characters</small>
          </label>

          <label>Social sharing image
            <select disabled={!canManagePages} value={seo.image || ''} onChange={event => patch({ image: event.target.value }, 'Social image saved')}>
              <option value="">Use website default social image</option>
              {imageAssets.map(asset => <option key={asset.id || asset.url} value={resolvedImage(asset)}>{asset.name || asset.slotId || 'Image asset'}</option>)}
            </select>
          </label>

          <label>Or paste image URL
            <input
              disabled={!canManagePages}
              value={seo.image || ''}
              placeholder="https://…"
              onChange={event => onUpdateSeo(page.id, { ...seo, image: event.target.value }, null, false)}
              onBlur={() => patch({ image: seo.image || '' }, 'Social image saved')}
            />
          </label>

          <label className="formCheck seoNoIndex">
            <input type="checkbox" disabled={!canManagePages} checked={seo.noIndex === true} onChange={event => patch({ noIndex: event.target.checked }, 'Search visibility saved')} />
            Hide this page from search engines
          </label>
          <small className="pageManagerHelp">Hidden pages can still be opened by direct URL unless the page itself is also set to not visible.</small>
        </div>

        <div className="seoPreviews">
          <article className="searchPreview">
            <span>{pageUrl}</span>
            <h3>{previewTitle} | {website?.name || 'Website'}</h3>
            <p>{previewDescription}</p>
          </article>

          <article className="socialPreview">
            <div className="socialPreviewImage">{previewImage ? <img src={previewImage} alt="Social sharing preview" /> : <span>Website default image</span>}</div>
            <div><small>{domain || 'example.com'}</small><h3>{previewTitle}</h3><p>{previewDescription}</p></div>
          </article>

          <div className={`indexStatus ${seo.noIndex ? 'blocked' : ''}`}>
            <b>{seo.noIndex ? 'Not indexed' : 'Searchable'}</b>
            <span>{seo.noIndex ? 'Search engines are instructed not to list this page.' : 'Search engines may include this page after it is published and crawled.'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
