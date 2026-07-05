import { demoAccounts } from '../../services/auth.js'
import { Logo } from '../../layouts/Shell.jsx'

export function LoginWorkspace() {
  return <div className="login authLogin"><div className="authBackdrop"></div><section className="card loginCard authCard"><Logo /><span>Secure Access</span><h1>KSJ DIGITAL</h1><p>Sign in to manage your website, client portal, support, publishing and analytics.</p><div className="loginFields"><label>Email<input defaultValue="client@twotonetaj.com" /></label><label>Password<input type="password" defaultValue="password" /></label></div><a href="/client">Sign In</a><div className="demoSwitch"><b>Demo Access</b>{demoAccounts.map(account => <button key={account.id} onClick={() => location.href = account.home}><span>{account.label}</span><small>{account.websiteAccess}</small></button>)}</div><footer>Protected client access · Owner controlled permissions · Website-safe editing</footer></section></div>
}
