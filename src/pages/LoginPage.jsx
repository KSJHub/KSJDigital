import { useState } from 'react'
import { Logo } from '../layouts/Shell.jsx'
import { signIn } from '../services/auth.js'

export function LoginPage() {
  const [email, setEmail] = useState('ksj@ksjdigital.co.uk')
  const [password, setPassword] = useState('ksj123')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    const result = signIn(email, password)
    if (result.error) {
      setError(result.error)
      return
    }
    location.href = result.account.home
  }

  return <div className="login authLogin"><div className="authBackdrop"></div><form className="card loginCard authCard" onSubmit={submit}><Logo /><span>Secure Portal</span><h1>KSJ DIGITAL</h1><p>Sign in to manage your website.</p><div className="loginFields"><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} /></label></div><div className="loginOptions"><label><input type="checkbox" />Remember me</label><a>Forgot password?</a></div>{error && <p className="loginError">{error}</p>}<button className="loginSubmit" type="submit">Sign In</button><div className="loginHint"><b>Test access</b><span>Owner: ksj@ksjdigital.co.uk / ksj123</span><span>Client: taj@twotonetaj.com / taj123</span></div><footer>Need access? Contact your KSJ Digital administrator.</footer></form></div>
}
