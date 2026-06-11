import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';

const portalHighlights = [
  'Secure Access',
  'Content Editing',
  'Publishing Workflow',
  'Support Access',
];

export default function Portals() {
  return (
    <main className="portals-shell portals-access-only">
      <section className="portals-hero portals-public-hero">
        <div className="portals-brand-card portals-public-card">
          <img src={KsjDigitalLogo} alt="KSJ Digital" className="portals-logo" />

          <div>
            <p className="eyebrow">KSJ Digital Portals</p>
            <h1>Website Management. Simplified.</h1>
            <p>
              Secure access for approved KSJ Digital clients to manage content,
              request publishing, access support, and keep their digital presence under control.
            </p>
            <div className="portal-feature-row" aria-label="Portal features">
              {portalHighlights.map((item) => (
                <span key={item}>{item}</span>
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
          <form>
            <label>
              Email Address
              <input type="email" placeholder="Enter your email address" />
            </label>
            <label>
              Password
              <input type="password" placeholder="Enter your password" />
            </label>
            <div className="portal-login-options">
              <span>Remember me</span>
              <span>Forgot password?</span>
            </div>
            <button type="button">Login</button>
          </form>
          <small>Account access is created and approved by KSJ Digital.</small>
        </aside>
      </section>

      <section className="portal-access-note" aria-label="Portal security notice">
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
