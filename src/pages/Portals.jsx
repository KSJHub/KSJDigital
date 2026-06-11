import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';

export default function Portals() {
  return (
    <main className="portals-shell portals-access-only">
      <section className="portals-hero portals-public-hero">
        <div className="portals-brand-card portals-public-card">
          <div className="portal-brand-lockup">
            <img src={KsjDigitalLogo} alt="KSJ Digital" className="portals-logo" />
            <span>KSJ Digital Portals</span>
          </div>

          <div>
            <p className="eyebrow">Client portal access</p>
            <h1>Manage your digital presence through KSJ Digital Portals.</h1>
            <p>
              Secure access to website management, content updates, approvals, support,
              billing, and account services for approved KSJ Digital clients.
            </p>
            <div className="portal-feature-row" aria-label="Portal features">
              <span>Website Management</span>
              <span>Content Updates</span>
              <span>Publishing</span>
              <span>Support</span>
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
          <p className="eyebrow">Private client area</p>
          <h2>Client website details are only shown after login.</h2>
          <p>
            This page is only the secure entry point. Website dashboards, client projects,
            editable content, billing, and support tools remain hidden until an approved account signs in.
          </p>
        </div>
        <a href="/">Need access?</a>
      </section>
    </main>
  );
}
