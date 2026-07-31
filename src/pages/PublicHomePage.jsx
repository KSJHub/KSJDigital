import { useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const PUBLIC_WEBSITE_ID = 'ksjdigital'
const PUBLIC_FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp'
const PUBLIC_FILE_MAX_BYTES = 5 * 1024 * 1024

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

function mergePublicFormConfiguration(forms, configuration) {
  const configByForm = new Map((Array.isArray(configuration) ? configuration : []).map(form => [form.id, form]))
  return (Array.isArray(forms) ? forms : []).map(form => {
    const configured = configByForm.get(form.id)
    const fieldsById = new Map((configured?.fields || []).map(field => [field.id, field]))
    return {
      ...form,
      successMessage: configured?.successMessage || '',
      conditionalLogicEnabled: configured?.conditionalLogicEnabled !== false,
      sections: Array.isArray(configured?.sections) ? configured.sections : [],
      fields: (form.fields || []).map(field => ({ ...field, ...(fieldsById.get(field.id) || {}) })),
    }
  })
}

function emptyValues(form) {
  return Object.fromEntries((form?.fields || []).map(field => [field.id, field.type === 'Checkbox' ? false : field.type === 'File' ? null : '']))
}

function conditionMatches(condition, values = {}) {
  if (!condition) return true
  const actual = values[condition.fieldId]
  if (condition.operator === 'checked') return actual === true
  if (condition.operator === 'unchecked') return actual !== true
  const text = actual === undefined || actual === null ? '' : String(actual).trim()
  if (condition.operator === 'equals') return text === condition.value
  if (condition.operator === 'notEquals') return text !== condition.value
  return true
}

function visibleFields(form, values) {
  const fields = form?.fields || []
  if (form?.conditionalLogicEnabled === false) return fields
  const visibleIds = new Set()
  return fields.filter(field => {
    const condition = field.condition
    const sourceVisible = !condition || visibleIds.has(condition.fieldId)
    const visible = sourceVisible && conditionMatches(condition, values)
    if (visible) visibleIds.add(field.id)
    return visible
  })
}

function formSteps(form) {
  const sections = Array.isArray(form?.sections) ? form.sections.filter(section => section?.id) : []
  return sections.length > 1 ? sections : [{ id: '', title: '', description: '' }]
}

function fieldsForStep(form, fields, step, steps) {
  if (steps.length === 1) return fields
  const firstId = steps[0]?.id || ''
  return fields.filter(field => (field.sectionId || firstId) === step.id)
}

function FieldHelp({ field, fallback = '' }) {
  const text = field.helpText || fallback
  return text ? <small>{text}</small> : null
}

function PublicFormField({ field, value, disabled, onChange }) {
  if (field.type === 'Checkbox') {
    return <label className="publicFormCheck"><input type="checkbox" checked={value === true} required={field.required} disabled={disabled} onChange={event => onChange(event.target.checked)} /> <span>{field.label}{field.required ? ' *' : ''}</span><FieldHelp field={field} /></label>
  }
  if (field.type === 'File') {
    return <label><span>{field.label}{field.required ? ' *' : ''}</span><input type="file" accept={PUBLIC_FILE_ACCEPT} required={field.required} disabled={disabled} onChange={event => onChange(event.target.files?.[0] || null)} /><FieldHelp field={field} fallback="PDF, PNG, JPG or WebP · max 5 MB" /></label>
  }
  if (field.type === 'Select') {
    const options = Array.isArray(field.options) ? field.options.filter(Boolean) : []
    return <label><span>{field.label}{field.required ? ' *' : ''}</span><select value={value || ''} required={field.required} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="">{field.placeholder || 'Choose an option'}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select><FieldHelp field={field} /></label>
  }

  const minimum = Number(field.minLength) > 0 ? Number(field.minLength) : undefined
  const maximum = Number(field.maxLength) > 0 ? Number(field.maxLength) : undefined
  const common = {
    value: value || '',
    required: field.required,
    disabled,
    placeholder: field.placeholder || '',
    minLength: minimum,
    maxLength: maximum,
    onChange: event => onChange(event.target.value),
  }
  if (field.type === 'Textarea') return <label><span>{field.label}{field.required ? ' *' : ''}</span><textarea {...common} rows="5" /><FieldHelp field={field} /></label>

  const type = field.type === 'Email' ? 'email' : field.type === 'Phone' ? 'tel' : field.type === 'Date' ? 'date' : 'text'
  return <label><span>{field.label}{field.required ? ' *' : ''}</span><input type={type} {...common} /><FieldHelp field={field} /></label>
}

export function PublicHomePage() {
  const [forms, setForms] = useState([])
  const [values, setValues] = useState({})
  const [honeypot, setHoneypot] = useState('')
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [formNotice, setFormNotice] = useState('')
  const [formAvailable, setFormAvailable] = useState(true)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const contactForm = useMemo(() => forms.find(form => /contact|enquir|project/i.test(form.name || '')) || forms[0] || null, [forms])
  const currentVisibleFields = useMemo(() => visibleFields(contactForm, values), [contactForm, values])
  const steps = useMemo(() => formSteps(contactForm), [contactForm])
  const safeStepIndex = Math.min(currentStepIndex, Math.max(0, steps.length - 1))
  const currentStep = steps[safeStepIndex]
  const currentStepFields = useMemo(() => fieldsForStep(contactForm, currentVisibleFields, currentStep, steps), [contactForm, currentVisibleFields, currentStep, steps])
  const stepped = steps.length > 1
  const finalStep = safeStepIndex === steps.length - 1

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.getPublicForms(PUBLIC_WEBSITE_ID),
      api.getPublicFormConfig(PUBLIC_WEBSITE_ID).catch(() => []),
    ])
      .then(([next, configuration]) => {
        if (cancelled) return
        const records = mergePublicFormConfiguration(next, configuration)
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
    setCurrentStepIndex(0)
    setFormNotice('')
  }, [contactForm?.id])

  function nextStep(event) {
    const form = event.currentTarget.form
    if (form && !form.reportValidity()) return
    setFormNotice('')
    setCurrentStepIndex(index => Math.min(steps.length - 1, index + 1))
  }

  function previousStep() {
    setFormNotice('')
    setCurrentStepIndex(index => Math.max(0, index - 1))
  }

  async function submitContact(event) {
    event.preventDefault()
    if (!contactForm || submitting) return
    setSubmitting(true)
    setFormNotice('Sending your enquiry…')
    try {
      const fields = visibleFields(contactForm, values)
      const fileFields = fields.filter(field => field.type === 'File')
      for (const field of fileFields) {
        const file = values[field.id]
        if (file && file.size > PUBLIC_FILE_MAX_BYTES) throw new Error(`${field.label || 'Attachment'} must be 5 MB or smaller.`)
      }

      let payload
      if (fileFields.length) {
        payload = new FormData()
        const textValues = Object.fromEntries(fields.filter(field => field.type !== 'File').map(field => [field.id, values[field.id]]))
        payload.append('values', JSON.stringify(textValues))
        payload.append('website', honeypot)
        payload.append('startedAt', String(startedAt))
        for (const field of fileFields) {
          const file = values[field.id]
          if (file) payload.append(field.id, file, file.name)
        }
      } else {
        payload = {
          values: Object.fromEntries(fields.map(field => [field.id, values[field.id]])),
          website: honeypot,
          startedAt,
        }
      }

      await api.submitPublicForm(PUBLIC_WEBSITE_ID, contactForm.id, payload)
      setValues(emptyValues(contactForm))
      setHoneypot('')
      setStartedAt(Date.now())
      setCurrentStepIndex(0)
      setFormNotice(contactForm.successMessage || 'Thanks — your enquiry has been sent.')
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
          <span><strong>KSJ Digital</strong><small>Technology • Infrastructure • Development</small></span>
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
          <p>KSJ Digital develops websites, automation systems, community platforms, and software products designed to grow with your business and community.</p>
          <div className="publicActions"><button onClick={() => scrollToSection('projects')}>Explore Our Projects</button><button className="secondary" onClick={() => scrollToSection('contact')}>Contact Us</button></div>
        </div>

        <aside className="publicPlatformCard" id="projects">
          <div className="publicLogoPanel"><img src="/ksj-digital-logo.svg" alt="KSJ Digital platform" /></div>
          <article><span>Primary Platform</span><h2>KSJ Digital</h2><p>Company website, hosting, infrastructure, automation, and future client systems.</p></article>
          <article><span>Active Ecosystem</span><div className="ecosystemGrid"><b>KSJ Digital</b><b>TwoToneTaj</b><b>Client Systems</b><b>Future Systems</b></div></article>
        </aside>
      </section>

      <section className="publicPills" id="infrastructure"><span>Primary Platform</span><span>Hosting & Infrastructure</span><span>Discord Automation</span><span>Client Systems</span><span>Secure Deployments</span><span>Future Ready</span></section>

      <section className="publicSection" id="services">
        <span className="publicEyebrow">What We Build</span><h2>Services</h2>
        <div className="publicServiceGrid">{services.map(([icon, title, description]) => <article key={title}><span className="serviceIcon">{icon}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="publicContact" id="contact">
        <div><span className="publicEyebrow">Start a Project</span><h2>Build your next platform with KSJ Digital.</h2><p>For website, infrastructure, automation, and client-platform enquiries.</p><a className="publicContactEmail" href="mailto:ksj@ksjdigital.co.uk">ksj@ksjdigital.co.uk</a></div>
        {contactForm ? <form className="publicContactForm" onSubmit={submitContact}>
          <h3>{contactForm.name || 'Contact Us'}</h3>
          {stepped && <div className="publicFormProgress" aria-label={`Step ${safeStepIndex + 1} of ${steps.length}`}><div><span>Step {safeStepIndex + 1} of {steps.length}</span><b>{currentStep.title}</b></div><progress max={steps.length} value={safeStepIndex + 1} />{currentStep.description && <small>{currentStep.description}</small>}</div>}
          {currentStepFields.map(field => <PublicFormField key={field.id} field={field} value={values[field.id]} disabled={submitting} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} />)}
          <label className="publicFormTrap" aria-hidden="true">Website<input value={honeypot} tabIndex="-1" autoComplete="off" onChange={event => setHoneypot(event.target.value)} /></label>
          {stepped ? <div className="publicFormStepActions">{safeStepIndex > 0 && <button type="button" className="secondary" disabled={submitting} onClick={previousStep}>Previous</button>}{!finalStep ? <button type="button" disabled={submitting} onClick={nextStep}>Next</button> : <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Enquiry'}</button>}</div> : <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Enquiry'}</button>}
          {formNotice && <p className="publicFormNotice" aria-live="polite">{formNotice}</p>}
        </form> : formAvailable ? <p className="publicFormNotice">No public contact form is currently available.</p> : <a href="mailto:ksj@ksjdigital.co.uk">Email KSJ Digital</a>}
      </section>

      <footer className="publicFooter"><span>© {new Date().getFullYear()} KSJ Digital</span><a href="/login">Portal Login</a></footer>
    </main>
  )
}
