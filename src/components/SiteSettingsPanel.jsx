import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'

const groups = [
  [
    'brand',
    'Brand',
    [
      ['name', 'Brand Name'],
      ['tagline', 'Tagline'],
      ['shortTagline', 'Short Tagline'],
      ['ownerName', 'Owner Name'],
      ['communityName', 'Community Name'],
      ['supportCredit', 'Footer Credit'],
    ],
  ],
  [
    'contact',
    'Contact',
    [
      ['supportEmail', 'Support Email'],
      ['businessEmail', 'Business Email'],
    ],
  ],
  [
    'socials',
    'Social Links',
    [
      ['twitch', 'Twitch'],
      ['youtube', 'YouTube'],
      ['tiktok', 'TikTok'],
      ['kick', 'Kick'],
      ['instagram', 'Instagram'],
      ['discord', 'Discord'],
      ['linktree', 'Linktree'],
      ['paypal', 'PayPal'],
    ],
  ],
  [
    'platforms',
    'Platform IDs',
    [
      ['twitchChannel', 'Twitch Channel'],
      ['youtubeChannelId', 'YouTube Channel ID'],
    ],
  ],
]

const homeFields = [
  ['heroTitle', 'Hero Title', false],
  ['heroText', 'Hero Text', true],
  ['aboutText', 'About Text', true],
  ['merchTitle', 'Merch Title', false],
  ['merchText', 'Merch Text', true],
]

function valueOf(content, groupKey, fieldKey) {
  return content?.[groupKey]?.[fieldKey] || ''
}

function patchValue(content, groupKey, fieldKey, value) {
  return {
    ...content,
    [groupKey]: {
      ...(content[groupKey] || {}),
      [fieldKey]: value,
    },
  }
}

export function SiteSettingsPanel({ website }) {
  const account = getAccountFromPath()
  const canEdit = account?.role === 'owner' || account?.canEdit
  const [content, setContent] = useState(null)
  const [status, setStatus] = useState('Loading settings')
  const websiteId = website?.id

  useEffect(() => {
    if (!websiteId) return

    let cancelled = false

    async function loadSettings() {
      try {
        const data = await api.getContent(websiteId)
        if (!cancelled) {
          setContent(data)
          setStatus(canEdit ? 'Settings ready' : 'Preview only')
        }
      } catch (error) {
        if (!cancelled) setStatus(error.message || 'Settings unavailable')
      }
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [canEdit, websiteId])

  function setField(groupKey, fieldKey, value) {
    if (!canEdit) return
    setContent(current => patchValue(current || {}, groupKey, fieldKey, value))
  }

  async function saveSettings() {
    if (!content || !websiteId) return
    if (!canEdit) {
      setStatus('Edit permission required')
      return
    }
    setStatus('Saving settings')

    try {
      const saved = await api.saveContent(websiteId, content)
      setContent(saved)
      setStatus('Settings saved')
    } catch (error) {
      setStatus(error.message || 'Save failed')
    }
  }

  if (!websiteId) {
    return (
      <div className="card managerPanel publishBox">
        <h2>Site Settings</h2>
        <p>Waiting for an assigned website record from the API.</p>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="card managerPanel publishBox">
        <h2>Site Settings</h2>
        <p>{status}</p>
      </div>
    )
  }

  return (
    <div className="card managerPanel publishBox">
      <div className="panelHead">
        <div>
          <h2>Site Settings</h2>
          <p>{canEdit ? 'Edit live website values without touching code.' : 'View current website values.'}</p>
        </div>
        {canEdit && <button onClick={saveSettings}>{status === 'Saving settings' ? 'Saving...' : 'Save Settings'}</button>}
      </div>

      <div className="builderFields">
        {groups.map(([groupKey, title, fields]) => (
          <section key={groupKey}>
            <h3>{title}</h3>
            {fields.map(([fieldKey, label]) => (
              <label key={`${groupKey}-${fieldKey}`}>
                {label}
                <input
                  value={valueOf(content, groupKey, fieldKey)}
                  disabled={!canEdit}
                  onChange={event => setField(groupKey, fieldKey, event.target.value)}
                />
              </label>
            ))}
          </section>
        ))}

        <section>
          <h3>Homepage Copy</h3>
          {homeFields.map(([fieldKey, label, multiline]) => (
            <label key={fieldKey}>
              {label}
              {multiline ? (
                <textarea
                  value={valueOf(content, 'home', fieldKey)}
                  disabled={!canEdit}
                  onChange={event => setField('home', fieldKey, event.target.value)}
                />
              ) : (
                <input
                  value={valueOf(content, 'home', fieldKey)}
                  disabled={!canEdit}
                  onChange={event => setField('home', fieldKey, event.target.value)}
                />
              )}
            </label>
          ))}
        </section>
      </div>

      <small>{status}</small>
    </div>
  )
}
