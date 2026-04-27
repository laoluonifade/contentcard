/**
 * Brand kit readiness: shared between BrandKitPage, CalendarPage, DashboardPage.
 *
 * These are the five fields the AI relies on most heavily to produce
 * on-brand content. Generation is blocked until all are filled.
 */

export const REQUIRED_FIELDS = [
  {
    label: 'Brand description',
    tab: 'Basics',
    hint: 'What does the business actually do?',
    check: (b) => (b?.description || '').trim().length > 12,
  },
  {
    label: 'Pain point',
    tab: 'Audience',
    hint: 'What customer problem are you solving?',
    check: (b) => (b?.pain_point || '').trim().length > 8,
  },
  {
    label: 'Target audience',
    tab: 'Audience',
    hint: 'Who are you speaking to?',
    check: (b) => (b?.target_audience || '').trim().length > 3,
  },
  {
    label: 'Tone tags',
    tab: 'Voice',
    hint: 'How does your brand sound?',
    check: (b) => (b?.tone_tags || []).length > 0,
  },
  {
    label: 'Language / dialect',
    tab: 'Voice',
    hint: 'English, Nigerian English, Pidgin…',
    check: (b) => (b?.language_style || '').trim().length > 0,
  },
  {
    label: 'Writing style',
    tab: 'Voice',
    hint: 'Conversational, Formal, Storytelling…',
    check: (b) => ((b?.brand_kit?.writing_style) || '').trim().length > 0,
  },
  {
    label: 'Key messages',
    tab: 'Identity',
    hint: 'What does your brand always say?',
    check: (b) => {
      const km = b?.brand_kit?.key_messages
      return Array.isArray(km) ? km.length > 0 : (km || '').trim().length > 0
    },
  },
  {
    label: 'Value proposition',
    tab: 'Identity',
    hint: 'Why should customers choose you?',
    check: (b) => ((b?.brand_kit?.value_proposition) || '').trim().length > 8,
  },
  {
    label: 'CTA style',
    tab: 'Identity',
    hint: 'How should calls to action sound?',
    check: (b) => ((b?.brand_kit?.cta_style) || '').trim().length > 3,
  },
  {
    label: 'Brand palette',
    tab: 'Visual',
    hint: 'Add brand colors or a visual system palette.',
    check: (b) => {
      const colors = Array.isArray(b?.brand_colors) ? b.brand_colors.filter(Boolean) : []
      const vs = b?.brand_kit?.visual_system || {}
      return colors.length >= 2 || ['primary_hex', 'secondary_hex', 'accent_hex'].every((k) => String(vs?.[k] || '').trim())
    },
  },
  {
    label: 'Design style',
    tab: 'Visual',
    hint: 'Bold, minimal, warm, premium…',
    check: (b) => (b?.design_style || '').trim().length > 0,
  },
  {
    label: 'Guidelines',
    tab: 'Rules',
    hint: 'What should the AI always do or avoid?',
    check: (b) => (b?.guidelines || '').trim().length > 8,
  },
]

/**
 * Returns array of { label, tab, hint } for each missing required field.
 * Empty array = brand is ready to generate.
 */
export function getMissingFields(brand) {
  if (!brand) return REQUIRED_FIELDS.map(({ label, tab, hint }) => ({ label, tab, hint }))
  return REQUIRED_FIELDS
    .filter(f => !f.check(brand))
    .map(({ label, tab, hint }) => ({ label, tab, hint }))
}

export function isBrandReady(brand) {
  return getMissingFields(brand).length === 0
}
