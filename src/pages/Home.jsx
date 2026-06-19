import ProjectCard from '../components/ProjectCard';
import ServiceCard from '../components/ServiceCard';
import TrustBar from '../components/TrustBar';
import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';
import {
  goliathFeatures,
  infrastructureItems,
  projects,
  services,
  trustItems,
} from '../data/homeData';

export default function Home() {
  return (
    <main>
      <section id="top" className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Technology • Infrastructure • Development</p>
            <h1>Building digital platforms that scale.</h1>
            <p className="hero-text">
              KSJ Digital develops websites, automation systems, community platforms,
              and software products designed to grow with your business and community.
            </p>
            <div className="hero-buttons">
              <a className="button primary-button" href="#projects">Explore Our Projects</a>
              <a className="button secondary-button" href="mailto:enquiries@ksjdigital.co.uk">Contact Us</a>
            </div>
          </div>

          <div className="hero-card">
            <div className="logo-card logo-card-image">
              <img src={KsjDigitalLogo} alt="KSJ Digital" className="hero-logo" />
            </div>
            <div className="mini-card">
              <span>Primary Platform</span>
              <strong>KSJ Digital</strong>
              <p>Company website, hosting, infrastructure, automation, and future client systems.</p>
            </div>
            <div className="mini-card">
              <span>Active Ecosystem</span>
              <ul className="hero-services">
                <li>KSJ Digital</li>
                <li>Goliath</li>
                <li>TwoToneTaj</li>
                <li>Future Systems</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <TrustBar items={trustItems} />

      <section id="services" className="section services">
        <div className="container">
          <p className="eyebrow">What we build</p>
          <h2>Services</h2>
          <div className="card-grid">
            {services.map((service) => <ServiceCard key={service.title} {...service} />)}
          </div>
        </div>
      </section>

      <section id="projects" className="section projects">
        <div className="container">
          <p className="eyebrow">KSJ Digital ecosystem</p>
          <h2>Platforms & Projects</h2>
          <div className="card-grid">
            {projects.map((project) => <ProjectCard key={project.title} {...project} />)}
          </div>
        </div>
      </section>

      <section id="goliath" className="section goliath">
        <div className="container goliath-showcase">
          <div className="goliath-copy">
            <p className="eyebrow">Flagship product</p>
            <h2>KSJ Goliath</h2>
            <p>
              Goliath is the flagship KSJ Digital Discord platform, built for moderation,
              tickets, forms, embeds, security, backups, analytics, and dashboard control.
            </p>
            <p className="goliath-link">goliath.ksjdigital.co.uk</p>
          </div>

          <div className="goliath-panel">
            <div className="dashboard-preview">
              <span>Discord Platform Dashboard</span>
            </div>
            <div className="feature-grid">
              {goliathFeatures.map((feature) => <span key={feature}>{feature}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section id="infrastructure" className="section infrastructure">
        <div className="container infrastructure-card">
          <div>
            <p className="eyebrow">Reliable foundations</p>
            <h2>Built on managed infrastructure.</h2>
            <p>
              KSJ Digital manages the foundations behind its platforms using modern
              deployment practices, secure hosting, and scalable systems designed for long-term use.
            </p>
          </div>

          <div className="infrastructure-grid">
            {infrastructureItems.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section id="contact" className="section contact">
        <div className="container contact-card">
          <p className="eyebrow">Next step</p>
          <h2>Ready to build something?</h2>
          <p>
            Whether you need a website, automation platform, community solution,
            or custom software project, KSJ Digital can help bring it to life.
          </p>
          <a className="button primary-button" href="mailto:enquiries@ksjdigital.co.uk">Get In Touch</a>
          <small>enquiries@ksjdigital.co.uk</small>
        </div>
      </section>
    </main>
  );
}
