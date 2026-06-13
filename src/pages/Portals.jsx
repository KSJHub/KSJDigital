import { useState } from 'react';
import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { authenticatePortalUser } from '../portals/auth/authService';

const portalHighlights = [
  'Secure Access',
  'Content Editing',
  'Publishing Workflow',
  'Support Access',
];

export default function Portals() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginStatus, setLoginStatus] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginStatus('Checking portal account...');

    const result = await authenticatePortalUser(email, password, { rememberMe });

    setIsLoggingIn(false);

    if (!result.ok) {
      setLoginStatus(result.message);
      return;
    }

    const role = result.session?.user?.role;
    window.location.href = role === 'owner' ? '/portals/admin' : '/portals/dashboard';
  }

  return (
    <main className="portals-shell portals-access-only portals-access-polished">
      <section className="portals-hero portals-public-hero">
        <div className="portals-brand-card portals-public-card portals-public-card-polished">
          <img src={KsjDigitalLogo} alt="KSJ Digital" className="portals-logo portals-main-logo" />

          <div>
            <p className="eyebrow">KSJ Digital Portals</p>
            <h1>Website Management. Simplified.</h1>
            <p>
              Secure access for approved KSJ Digital clients to manage content,
              request publishing, access support, and keep their digital presence under control.
            </p>
            <div className="portal-check-list" aria-label="Portal features">
              {portalHighlights.map((item) => (
                <span key={item}>✓ {item}</span>
              ))}
            </div>
          </div>
        </div>

        <aside className="portal-login-card" aria-label="Client portal login">
          <div className="portal-login-topline">
            <span>Portal Access</span>
            <small>ksjdigital.co.uk/portals</small>
          </div>
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <h2>Welcome Back</h2>
          <p>Login to access your client portal.</p>
          <form onSubmit={handleLogin}>
            <label>
              Email Address
              <input type="email" placeholder="Enter your email address" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label>
              Password
              <input type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
            <div className="portal-login-options">
              <label className="portal-remember-option"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Remember me</label>
              <span>Forgot password?</span>
            </div>
            <button type="submit" disabled={isLoggingIn}>{isLoggingIn ? 'Checking...' : 'Login'}</button>
          </form>
          {loginStatus && <p className="portal-inline-notice">{loginStatus}</p>}
          <small>Secure access is available to approved KSJ Digital clients only.</small>
        </aside>
      </section>

      <section className="portal-access-note portal-access-note-compact" aria-label="Portal security notice">
        <div>
          <p className="eyebrow">Secure client access</p>
          <h2>Private tools for authorised users only.</h2>
          <p>
            Website management, project data, billing information, and support tools
            are only available after an approved account signs in.
          </p>
        </div>
        <a href="/">Contact KSJ Digital</a>
      </section>
    </main>
  );
}
