import { useEffect, useState } from 'react'
import { Logo } from '../layouts/Shell.jsx'
import { signIn } from '../services/auth.js'

const REMEMBER_KEY = 'ksjDigitalRememberLogin'
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_KSJ_DEV_BYPASS_AUTH === 'true'
const DEV_ACCOUNTS = [
  {
    id: 'owner',
    title: 'Morgan — KSJ Owner',
    description: 'Full platform access across every managed website.',
    email: 'ksj@ksjdigital.co.uk',
    accessCode: 'owner-access',
  },
  {
    id: 'twotonetaj',
    title: 'Taj — TwoToneTaj Client',
    description: 'Client-only access to the assigned TwoToneTaj website.',
    email: 'taj@twotonetaj.com',
    accessCode: 'client-access',
  },
]

function getRememberedLogin() {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null') || {
      email: '',
      remember: false,
    }
  } catch {
    return {
      email: '',
      remember: false,
    }
  }
}

export function LoginPage() {
  const remembered = getRememberedLogin()
  const [email, setEmail] = useState(remembered.email)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered.remember)
  const [error, setError] = useState('')
  const [activeDevAccount, setActiveDevAccount] = useState('')

  useEffect(() => {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, remember: true }))
    }
  }, [email, remember])

  async function completeSignIn(loginEmail, loginPassword, accountId = '') {
    setError('')
    setActiveDevAccount(accountId || 'standard')
    const result = await signIn(loginEmail, loginPassword)
    setActiveDevAccount('')

    if (result.error) {
      setError(result.error)
      return false
    }

    location.href = result.account.home
    return true
  }

  async function submit(event) {
    event.preventDefault()
    const signedIn = await completeSignIn(email, password)
    if (!signedIn) return

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, remember: true }))
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
  }

  return (
    <div className="login authLogin">
      <div className="authBackdrop"></div>
      <form className="card loginCard authCard" onSubmit={submit}>
        <Logo />
        <span>{DEV_BYPASS ? 'Local Development Portal' : 'Secure Portal'}</span>
        <h1>KSJ DIGITAL</h1>
        <p>
          {DEV_BYPASS
            ? 'Choose a real development account to test its portal and permissions.'
            : 'Sign in to manage your website.'}
        </p>

        {DEV_BYPASS ? (
          <>
            <div className="loginFields">
              {DEV_ACCOUNTS.map(account => (
                <button
                  className="loginSubmit"
                  type="button"
                  key={account.id}
                  disabled={Boolean(activeDevAccount)}
                  onClick={() => completeSignIn(account.email, account.accessCode, account.id)}
                >
                  <b>
                    {activeDevAccount === account.id ? 'Opening Portal...' : account.title}
                  </b>
                  <small>{account.description}</small>
                </button>
              ))}
            </div>
            <div className="loginHint">
              <b>Development mode only</b>
              <span>
                Each button creates a normal server session using that account's real permissions.
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="loginFields">
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </label>
            </div>
            <div className="loginOptions">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={event => setRemember(event.target.checked)}
                />
                Remember me
              </label>
              <button
                className="linkButton"
                type="button"
                onClick={() => setError('Password reset is not connected yet.')}
              >
                Forgot password?
              </button>
            </div>
            <button className="loginSubmit" type="submit" disabled={Boolean(activeDevAccount)}>
              {activeDevAccount ? 'Signing In...' : 'Sign In'}
            </button>
          </>
        )}

        {error && <p className="loginError">{error}</p>}
        <footer>Need access? Contact your KSJ Digital administrator.</footer>
      </form>
    </div>
  )
}
