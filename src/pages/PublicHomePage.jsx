import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const PUBLIC_WEBSITE_ID = 'ksjdigital'

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

function emptyValues(form) {
  return Object.fromEntries((form?.fields || []).map(field => [field.id, field.type === 'Checkbox' ? false : '']))
}

function PublicFormField({ field, value, disabled, onChange }) {
  if (field.type === 'Checkbox') {
    return <label className="publicFormCheck"><input type="checkbox" checked={value === true} required={field.required} disabled={disabled} onChange={event => onChange(event.target.checked)} /> <span>{field.label}{field.required ? ' *' : ''}</span></label>
  }

  const common = {
    value: value || '',
    required: field.required,
    disabled,
    placeholder: field.placeholder || '',
    onChange: event => onChange(event.target.value),
  }
  if (field.type === 'Textarea') return <label><span>{field.label}{field.required ? ' *' : ''}</span><textarea {...common} rows="5" /></label>

  const type = field.type === 'Email' ? 'email' : field.type === 'Phone' ? 'tel' : field.type === 'Date' ? 'date' : 'text'
  return <label><span>{field.label}{field.required ? ' *' : ''}</span><input type={type} {...common} /></label>
}

export function PublicHomePage() {
  const [forms, setForms] = useState([])
  const [values, setValues] = useState({})
  const [honeypot, setHoneypot] = useState('')
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [formNotice, setFormNotice] = useState('')
  const [formAvailable, setFormAvailable] = useState(true)

  const contactForm = useMemo(() => {
    const available = forms.filter(form => form?.submissionEnabled !== false)
    return available.find(form => /contact|enquir|project/i.test(form.name || '')) || available[0] || null
  }, [forms])

  useEffect(() => {
    let cancelled = false
    api.getPublicForms(PUBLIC_WEBSITE_ID)
      .then(next => {
        if (cancelled) return
        const records = Array.isArray(next) ? next : []
        setForms(records)
        setFormAvailable(records.length > 0)
      })
      .catch(() => {
        if (!cancelled) setFormAvailable(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!contactForm) return
    setValues(emptyValues(contactForm))
    setStartedAt(Date.now())
  }, [contactForm?.id])

  async function submitContact(event) {
    event.preventDefault()
    if (!contactForm || submitting) return
    setSubmitting(true)
    setFormNotice('Sending your enquiry…')
    try {
      await api.submitPublicForm(PUBLIC_WEBSITE_ID, contactForm.id, { values, website: honeypot, startedAt })
      setValues(emptyValues(contactForm))
      setHoneypot('')
      setStartedAt(Date.now())
      setFormNotice('Thanks — your enquiry has been sent.')
    } catch (error) {
      setFormNotice(error.message || 'Your enquiry could not be sent. Please try again or email us directly.')
    } finally {
      setSubmitting(false)
    }
  }

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
          <a className="publicContactEmail" href="mailto:ksj@ksjdigital.co.uk">ksj@ksjdigital.co.uk</a>
        </div>
        {contactForm ? <form className="publicContactForm" onSubmit={submitContact}>
          <h3>{contactForm.name || 'Contact Us'}</h3>
          {(contactForm.fields || []).map(field => <PublicFormField
            key={field.id}
            field={field}
            value={values[field.id]}
            disabled={submitting}
            onChange={value => setValues(current => ({ ...current, [field.id]: value }))}
          />)}
          <label className="publicFormTrap" aria-hidden="true">Website<input value={honeypot} tabIndex="-1" autoComplete="off" onChange={event => setHoneypot(event.target.value)} /></label>
          <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Enquiry'}</button>
          {formNotice && <p className="publicFormNotice" aria-live="polite">{formNotice}</p>}
        </form> : formAvailable ? <p className="publicFormNotice">No public contact form is currently available.</p> : <a href="mailto:ksj@ksjdigital.co.uk">Email KSJ Digital</a>}
      </section>

      <footer className="publicFooter">
        <span>© {new Date().getFullYear()} KSJ Digital</span>
        <a href="/login">Portal Login</a>
      </footer>
    </main>
  )
}
