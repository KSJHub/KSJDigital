import { useEffect, useState } from 'react'
import { Logo } from '../layouts/Shell.jsx'
import { signIn } from '../services/auth.js'

const REMEMBER_KEY = 'ksjDigitalRememberLogin'

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

  useEffect(() => {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, remember: true }))
    }
  }, [email, remember])

  function submit(event) {
    event.preventDefault()
    const result = signIn(email, password)

    if (result.error) {
      setError(result.error)
      return
    }

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, remember: true }))
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }

    location.href = result.account.home
  }

  return (
    <div className="login authLogin">
      <div className="authBackdrop"></div>
      <form className="card loginCard authCard" onSubmit={submit}>
        <Logo />
        <span>Secure Portal</span>
        <h1>KSJ DIGITAL</h1>
        <p>Sign in to manage your website.</p>
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
        {error && <p className="loginError">{error}</p>}
        <button className="loginSubmit" type="submit">
          Sign In
        </button>
        <div className="loginHint">
          <b>Secure account access</b>
          <span>Access is managed by KSJ Digital.</span>
        </div>
        <footer>Need access? Contact your KSJ Digital administrator.</footer>
      </form>
    </div>
  )
}
