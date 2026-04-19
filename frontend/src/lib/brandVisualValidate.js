/** Shared VBS (visual_system) validation for Brand kit, Generate, and Calendar. */

export function normalizeHex(h) {
  if (h == null || typeof h !== 'string') return null
  let s = h.trim()
  if (!s) return null
  if (!s.startsWith('#')) s = `#${s}`
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : null
}

/** Human-readable block reason, or null if OK to generate. */
export function brandVisualBlockReason(brand) {
  if (!brand) return null
  const vs = (brand.brand_kit || {}).visual_system || {}
  for (const k of ['primary_hex', 'secondary_hex', 'accent_hex']) {
    const v = vs[k]
    if (v != null && String(v).trim() !== '' && !normalizeHex(String(v))) {
      return `Invalid ${k.replace(/_/g, ' ')} in Visual brand system. Use #RRGGBB — open Brand kit → Visual.`
    }
  }
  if (vs.neutral_hex != null && String(vs.neutral_hex).trim() !== '' && !normalizeHex(String(vs.neutral_hex))) {
    return 'Invalid neutral hex in Visual brand system. Open Brand kit → Visual.'
  }
  for (const fh of vs.forbidden_hexes || []) {
    if (String(fh).trim() && !normalizeHex(String(fh))) {
      return 'Invalid line in forbidden hex list. Open Brand kit → Visual.'
    }
  }
  const refs = vs.reference_urls || []
  if (refs.length > 0 && !vs.reference_rights_attested) {
    return 'Confirm reference rights in Brand kit → Visual, or remove reference URLs, before generating.'
  }
  return null
}
