import ProjectCard from '../components/ProjectCard';
import ServiceCard from '../components/ServiceCard';
import TrustBar from '../components/TrustBar';
import { goliathFeatures, projects, services, trustItems } from '../data/homeData';

export default function Home() {
  return (
    <main>
      <section id="top" className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">KSJ Digital V2</p>
            <h1>Digital solutions built properly for brands, creators, and communities.</h1>
            <p className="hero-text">
              Websites, Discord systems, dashboards, branding assets, automation tools,
              and hosted foundations built with a clean professional approach.
            </p>
            <div className="hero-buttons">
              <a className="button primary-button" href="mailto:ksj@ksjdigital.co.uk">Start a Project</a>
              <a className="button secondary-button" href="#projects">View Projects</a>
            </div>
          </div>

          <div className="hero-card">
            <div className="logo-card">
              <div className="logo-symbol">KSJ</div>
              <div className="logo-divider" />
              <div className="logo-text">
                <strong>KSJ</strong>
                <span>DIGITAL</span>
              </div>
            </div>

            <div className="mini-card">
              <span>Infrastructure</span>
              <strong>VPS Hosted</strong>
              <p>GitHub managed • HTTPS ready • Custom built</p>
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
            {services.map((service) => (
              <ServiceCard key={service.title} {...service} />
            ))}
          </div>
        </div>
      </section>

      <section id="projects" className="section projects">
        <div className="container">
          <p className="eyebrow">Proof of work</p>
          <h2>Projects</h2>
          <div className="card-grid">
            {projects.map((project) => (
              <ProjectCard key={project.title} {...project} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
