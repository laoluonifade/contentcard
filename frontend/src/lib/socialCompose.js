/**
 * Helpers for opening platform composers and copying captions.
 * We do not call Instagram/Facebook publish APIs; these are user-driven flows.
 */

export function fullPostCaptionText(caption, hashtags) {
  const tags = (hashtags || [])
    .map((h) => {
      const s = String(h || '').trim()
      if (!s) return ''
      return s.startsWith('#') ? s : `#${s}`
    })
    .filter(Boolean)
    .join(' ')
  const cap = (caption || '').trim()
  return [cap, tags].filter(Boolean).join('\n\n')
}

export function twitterIntentUrl(text) {
  const t = (text || '').trim()
  if (!t) return 'https://twitter.com/intent/tweet'
  const max = 260
  const body = t.length > max ? `${t.slice(0, max - 1)}…` : t
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(body)}`
}
