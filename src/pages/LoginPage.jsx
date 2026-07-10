import { useEffect, useState } from 'react'
import { Logo } from '../layouts/Shell.jsx'
import { signIn } from '../services/auth.js'

const REMEMBER_KEY = 'ksjDigitalRememberLogin'
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_KSJ_DEV_BYPASS_AUTH === 'true'
const DEV_OWNER_EMAIL = 'ksj@ksjdigital.co.uk'
const DEV_OWNER_ACCESS = 'owner-access'

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
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, remember: true }))
    }
  }, [email, remember])

  async function completeSignIn(loginEmail, loginPassword) {
    setError('')
    setIsSubmitting(true)
    const result = await signIn(loginEmail, loginPassword)
    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    location.href = result.account.home
  }

  async function submit(event) {
    event.preventDefault()
    await completeSignIn(email, password)

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
            ? 'Password entry is temporarily bypassed for local testing.'
            : 'Sign in to manage your website.'}
        </p>

        {DEV_BYPASS ? (
          <>
            <button
              className="loginSubmit"
              type="button"
              disabled={isSubmitting}
              onClick={() => completeSignIn(DEV_OWNER_EMAIL, DEV_OWNER_ACCESS)}
            >
              {isSubmitting ? 'Opening Portal...' : 'Enter Owner Portal'}
            </button>
            <div className="loginHint">
              <b>Development mode only</b>
              <span>Normal password authentication remains active in production.</span>
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
            <button className="loginSubmit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </>
        )}

        {error && <p className="loginError">{error}</p>}
        <footer>Need access? Contact your KSJ Digital administrator.</footer>
      </form>
    </div>
  )
}
