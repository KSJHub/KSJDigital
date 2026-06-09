import KsjDigitalLogo from '../assets/logos/KsjDigitalLogo.png';

export default function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label="KSJ Digital home">
          <span className="brand-mark brand-logo-mark">
            <img src={KsjDigitalLogo} alt="" />
          </span>
          <span>
            <strong>KSJ Digital</strong>
            <small>Websites • Discord • Automation</small>
          </span>
        </a>

        <nav className="nav" aria-label="Main navigation">
          <a href="#services">Services</a>
          <a href="#projects">Projects</a>
          <a href="#goliath">Goliath</a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </header>
  );
}
