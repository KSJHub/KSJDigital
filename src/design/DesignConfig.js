/**
 * KSJ Digital shared design defaults.
 * Brand assets use the existing repository files; replace via the existing
 * brand/media workflows rather than embedding assets in page components.
 * This module is presentation-only: no customer data or business logic.
 */
export const DesignConfig = Object.freeze({
  brand: {
    name: 'KSJ Digital',
    tagline: 'Technology • Infrastructure • Development',
    logo: '/ksj-digital-logo.svg',
  },
  colors: {
    background: '#050A14',
    surface: '#0B1628',
    surfaceRaised: '#11213A',
    primary: '#168BFF',
    accent: '#00D4FF',
    text: '#F6F9FF',
    muted: '#B8C9E4',
    border: '#28466F',
  },
  typography: {
    body: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
    heading: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
    hero: 'clamp(2.65rem, 6vw, 6.4rem)',
    h2: 'clamp(2rem, 4vw, 4rem)',
  },
  layout: {
    contentWidth: '1400px',
    headerHeight: '76px',
    radius: '20px',
    sectionGap: 'clamp(3rem, 6vw, 6rem)',
  },
  effects: { glow: true, motion: true },
  breakpoints: { mobile: 600, tablet: 900, desktop: 1280 },
})

/** Apply a site-specific, validated theme object when one is available. */
export function applyDesignConfig(config = DesignConfig, target = document.documentElement) {
  const mappings = {
    '--ksj-bg': config.colors.background,
    '--ksj-surface': config.colors.surface,
    '--ksj-surface-raised': config.colors.surfaceRaised,
    '--ksj-primary': config.colors.primary,
    '--ksj-accent': config.colors.accent,
    '--ksj-text': config.colors.text,
    '--ksj-muted': config.colors.muted,
    '--ksj-border': config.colors.border,
    '--ksj-font-body': config.typography.body,
    '--ksj-font-heading': config.typography.heading,
    '--ksj-font-hero': config.typography.hero,
    '--ksj-font-h2': config.typography.h2,
    '--ksj-content-width': config.layout.contentWidth,
    '--ksj-header-height': config.layout.headerHeight,
    '--ksj-radius': config.layout.radius,
    '--ksj-section-gap': config.layout.sectionGap,
  }
  for (const [property, value] of Object.entries(mappings)) {
    if (typeof value === 'string' && value.trim()) target.style.setProperty(property, value)
  }
}
