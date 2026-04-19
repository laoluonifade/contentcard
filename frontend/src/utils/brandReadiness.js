/**
 * Brand kit readiness — shared between BrandKitPage, CalendarPage, DashboardPage.
 *
 * These are the five fields the AI relies on most heavily to produce
 * on-brand content. Generation is blocked until all are filled.
 */

export const REQUIRED_FIELDS = [
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
    tab: 'Messaging',
    hint: 'What does your brand always say?',
    check: (b) => {
      const km = b?.brand_kit?.key_messages
      return Array.isArray(km) ? km.length > 0 : (km || '').trim().length > 0
    },
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
