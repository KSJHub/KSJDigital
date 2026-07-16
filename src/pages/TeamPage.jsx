import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../layouts/Shell.jsx'
import { api } from '../services/api.js'
import { getAccountFromPath } from '../services/auth.js'
import '../styles/team.css'

const blankMember = {
  name: '',
  email: '',
  accessCode: '',
  roleLabel: 'Website Editor',
  status: 'Active',
  canEdit: true,
  canManagePages: false,
  canManageMedia: true,
  canRequestUpdates: true,
  canViewSupport: true,
  canManageTeam: false,
}

const permissionLabels = {
  canEdit: 'Edit website content',
  canManagePages: 'Create and manage pages',
  canManageMedia: 'Manage branding and media',
  canRequestUpdates: 'Submit website changes',
  canViewSupport: 'Use support',
  canManageTeam: 'Manage this team',
}

export function TeamPage({ client = false }) {
  const account = getAccountFromPath()
  const canManage = account?.role === 'owner' || account?.canManageTeam || account?.roleLabel === 'Website Owner'
  const [members, setMembers] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState(blankMember)
  const [notice, setNotice] = useState('Loading')
  const selected = useMemo(() => members.find(member => member.id === selectedId) || null, [members, selectedId])

  async function load(preferredId = '') {
    try {
      const next = await api.getTeam()
      setMembers(next)
      const target = next.find(member => member.id === (preferredId || selectedId)) || next[0] || null
      setSelectedId(target?.id || '')
      setForm(target ? { ...blankMember, ...target, accessCode: '' } : blankMember)
      setNotice('Ready')
    } catch (error) {
      setNotice(error.message || 'Team unavailable')
    }
  }

  useEffect(() => { load() }, [])

  function choose(member) {
    setSelectedId(member.id)
    setForm({ ...blankMember, ...member, accessCode: '' })
  }

  function update(changes) {
    setForm(current => ({ ...current, ...changes }))
  }

  function addNew() {
    setSelectedId('')
    setForm(blankMember)
    setNotice('New team member')
  }

  async function save() {
    if (!canManage) return setNotice('Team management permission required')
    try {
      setNotice('Saving')
      const payload = { ...form, websiteId: account?.websiteId || account?.websiteIds?.[0] || '' }
      const saved = selectedId
        ? await api.updateTeamMember(selectedId, payload)
        : await api.createTeamMember(payload)
      await load(saved.id)
      setNotice(selectedId ? 'Team member updated' : 'Team member added')
    } catch (error) {
      setNotice(error.message || 'Team member could not be saved')
    }
  }

  async function remove() {
    if (!selectedId || !canManage) return
    if (!window.confirm(`Remove ${selected?.name || 'this team member'}?`)) return
    try {
      await api.deleteTeamMember(selectedId)
      await load()
      setNotice('Team member removed')
    } catch (error) {
      setNotice(error.message || 'Team member could not be removed')
    }
  }

  return (
    <Layout client={client} title="Team">
      <section className="moduleHero card">
        <div>
          <span>Your Team</span>
          <h2>People who manage your website</h2>
          <p>Team members only receive access to this website and can never see KSJ Digital tools or another client’s workspace.</p>
        </div>
        {canManage && <button onClick={addNew}>Add Team Member</button>}
      </section>

      <section className="teamWorkspace">
        <aside className="card teamList">
          <div className="panelHead"><h2>Members</h2><span>{members.length}</span></div>
          {members.map(member => (
            <button key={member.id} className={member.id === selectedId ? 'active' : ''} onClick={() => choose(member)}>
              <b>{member.displayName || member.name}</b>
              <small>{member.email}</small>
              <span>{member.roleLabel || 'Team Member'} · {member.status || 'Active'}</span>
            </button>
          ))}
          {!members.length && <p>No team members have been added yet.</p>}
        </aside>

        <section className="card teamEditor">
          <div className="panelHead"><h2>{selectedId ? 'Edit Team Member' : 'Add Team Member'}</h2><span>{notice}</span></div>
          {!canManage && <p className="teamReadOnly">Only the website owner or an authorised team manager can change team access.</p>}
          <div className="teamForm">
            <label>Name<input value={form.name || ''} disabled={!canManage} onChange={event => update({ name: event.target.value })} /></label>
            <label>Email<input type="email" value={form.email || ''} disabled={!canManage || !!selectedId} onChange={event => update({ email: event.target.value })} /></label>
            <label>{selectedId ? 'New password (optional)' : 'Temporary password'}<input type="password" value={form.accessCode || ''} disabled={!canManage} onChange={event => update({ accessCode: event.target.value })} /></label>
            <label>Role<select value={form.roleLabel || 'Website Editor'} disabled={!canManage} onChange={event => update({ roleLabel: event.target.value })}><option>Website Manager</option><option>Website Editor</option><option>Shop Manager</option><option>Support</option><option>Viewer</option></select></label>
            <label>Status<select value={form.status || 'Active'} disabled={!canManage} onChange={event => update({ status: event.target.value })}><option>Active</option><option>Suspended</option></select></label>
          </div>

          <div className="permissionGrid teamPermissions">
            {Object.entries(permissionLabels).map(([permission, label]) => (
              <label key={permission}><input type="checkbox" checked={!!form[permission]} disabled={!canManage || (account?.role !== 'owner' && account?.[permission] !== true)} onChange={event => update({ [permission]: event.target.checked })} />{label}</label>
            ))}
          </div>

          {canManage && <div className="accountActions"><button onClick={save}>Save Team Member</button><button onClick={remove} disabled={!selectedId || selectedId === account?.id}>Remove</button></div>}
        </section>
      </section>
    </Layout>
  )
}
