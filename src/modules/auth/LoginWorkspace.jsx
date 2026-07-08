import { Logo } from '../../layouts/Shell.jsx'

export function LoginWorkspace() {
  return (
    <div className="login authLogin">
      <div className="authBackdrop"></div>
      <section className="card loginCard authCard">
        <Logo />
        <span>Secure Portal</span>
        <h1>KSJ DIGITAL</h1>
        <p>Sign in to manage your website.</p>
        <div className="loginFields">
          <label>
            Email
            <input type="email" placeholder="you@example.com" />
          </label>
          <label>
            Password
            <input type="password" placeholder="Enter your password" />
          </label>
        </div>
        <div className="loginOptions">
          <label>
            <input type="checkbox" />
            Remember me
          </label>
          <a>Forgot password?</a>
        </div>
        <a href="/client">Sign In</a>
        <footer>Need access? Contact your KSJ Digital administrator.</footer>
      </section>
    </div>
  )
}
