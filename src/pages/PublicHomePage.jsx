const services = [
  ['🌐', 'Company Websites', 'Clean, responsive websites for brands, creators, communities, and businesses.'],
  ['🖥️', 'Hosting & Infrastructure', 'VPS hosting, HTTPS setup, GitHub deployments, maintenance, and reliable foundations.'],
  ['🤖', 'Automation Systems', 'Custom workflows, Discord automation, dashboard tools, and platform integrations.'],
  ['🛠️', 'Platform Development', 'Purpose-built portals, management systems, and scalable client tools.'],
  ['🔐', 'Secure Deployments', 'Protected services, controlled access, backups, and dependable release workflows.'],
  ['💎', 'White-Label Commerce', 'Reusable website and commerce systems designed to support future client brands.'],
]

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export function PublicHomePage() {
  return (
    <main className="publicSite" id="top">
      <header className="publicHeader">
        <a className="publicBrand" href="#top" aria-label="KSJ Digital home">
          <img src="/ksj-digital-logo.svg" alt="KSJ Digital" />
          <span>
            <strong>KSJ Digital</strong>
            <small>Technology • Infrastructure • Development</small>
          </span>
        </a>
        <nav aria-label="Public navigation">
          <button onClick={() => scrollToSection('services')}>Services</button>
          <button onClick={() => scrollToSection('projects')}>Projects</button>
          <button onClick={() => scrollToSection('infrastructure')}>Infrastructure</button>
          <a href="/login">Portals</a>
          <button onClick={() => scrollToSection('contact')}>Contact</button>
        </nav>
      </header>

      <section className="publicHero">
        <div className="publicHeroCopy">
          <span className="publicEyebrow">Technology • Infrastructure • Development</span>
          <h1>Building digital platforms that scale.</h1>
          <p>
            KSJ Digital develops websites, automation systems, community platforms, and software products
            designed to grow with your business and community.
          </p>
          <div className="publicActions">
            <button onClick={() => scrollToSection('projects')}>Explore Our Projects</button>
            <button className="secondary" onClick={() => scrollToSection('contact')}>Contact Us</button>
          </div>
        </div>

        <aside className="publicPlatformCard" id="projects">
          <div className="publicLogoPanel">
            <img src="/ksj-digital-logo.svg" alt="KSJ Digital platform" />
          </div>
          <article>
            <span>Primary Platform</span>
            <h2>KSJ Digital</h2>
            <p>Company website, hosting, infrastructure, automation, and future client systems.</p>
          </article>
          <article>
            <span>Active Ecosystem</span>
            <div className="ecosystemGrid">
              <b>KSJ Digital</b>
              <b>TwoToneTaj</b>
              <b>Client Systems</b>
              <b>Future Systems</b>
            </div>
          </article>
        </aside>
      </section>

      <section className="publicPills" id="infrastructure">
        <span>Primary Platform</span>
        <span>Hosting & Infrastructure</span>
        <span>Discord Automation</span>
        <span>Client Systems</span>
        <span>Secure Deployments</span>
        <span>Future Ready</span>
      </section>

      <section className="publicSection" id="services">
        <span className="publicEyebrow">What We Build</span>
        <h2>Services</h2>
        <div className="publicServiceGrid">
          {services.map(([icon, title, description]) => (
            <article key={title}>
              <span className="serviceIcon">{icon}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="publicContact" id="contact">
        <div>
          <span className="publicEyebrow">Start a Project</span>
          <h2>Build your next platform with KSJ Digital.</h2>
          <p>For website, infrastructure, automation, and client-platform enquiries.</p>
        </div>
        <a href="mailto:ksj@ksjdigital.co.uk">ksj@ksjdigital.co.uk</a>
      </section>

      <footer className="publicFooter">
        <span>© {new Date().getFullYear()} KSJ Digital</span>
        <a href="/login">Portal Login</a>
      </footer>
    </main>
  )
}
