import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import { portalUser } from '../data/portalData';

export default function Portals() {
  return (
    <main className="portals-shell portals-access-only">
      <section className="portals-hero">
        <div className="portals-brand-card">
          <img src={KsjDigitalLogo} alt="KSJ Digital" className="portals-logo" />
          <div>
            <p className="eyebrow">KSJ Digital Portals</p>
            <h1>Secure website management for KSJ Digital clients.</h1>
            <p>
              A protected access point for approved KSJ Digital clients to securely sign in,
              manage their website content, preview updates, and request publication.
            </p>
            <div className="portal-feature-row" aria-label="Portal features">
              <span>Secure Login</span>
              <span>Client Access</span>
              <span>Website Management</span>
              <span>Approval Workflow</span>
            </div>
          </div>
        </div>

        <aside className="portal-login-card" aria-label="Client portal login">
          <img src={KsjDigitalLogo} alt="KSJ Digital" />
          <h2>Welcome Back</h2>
          <p>Login to access your client portal.</p>
          <form>
            <label>
              Email Address
              <input type="email" placeholder={portalUser.email} />
            </label>
            <label>
              Password
              <input type="password" placeholder="••••••••" />
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
            This public page is only the secure entry point. Website dashboards, client projects,
            editable content, billing, and support tools remain hidden until an approved account signs in.
          </p>
        </div>
        <a href="mailto:support@ksjdigital.co.uk">Need access?</a>
      </section>
    </main>
  );
}
