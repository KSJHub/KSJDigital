import { getPermissionSummary } from '../services/auth.js'

export function PermissionBanner({ account, client = false }) {
  const summary = getPermissionSummary(account)
  return <section className="permissionBanner card"><div><span>{client ? 'Client Access' : 'Owner Access'}</span><h2>{account.label}</h2><p>{summary.access} · {summary.edit} · {summary.publish}</p></div><div className="permissionPills"><b>{summary.role}</b><small>{account.name}</small></div></section>
}

export function AccessDenied({ account }) {
  return <div className="login"><section className="card accessDenied"><h1>Access Restricted</h1><p>{account.name} does not have permission to open this area.</p><a href={account.home}>Go to allowed dashboard</a></section></div>
}
