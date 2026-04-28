const GUEST_CONTEXT_KEY = 'contentcard.auth.guestContext'
const QUICK_FILL_WEBSITE_KEY = 'contentcard.signup.quickFillWebsite'

function safeJsonParse(raw) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getPostAuthPath(user, fallback = '/dashboard') {
  return user && user.onboarding_completed === false ? '/onboarding' : fallback
}

export function readGuestContext() {
  try {
    const parsed = safeJsonParse(sessionStorage.getItem(GUEST_CONTEXT_KEY))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function persistGuestContext(context) {
  const brandName = String(context?.brandName || '').trim()
  const website = String(context?.website || '').trim()
  const industry = String(context?.industry || '').trim()
  const goal = String(context?.goal || '').trim()
  if (!brandName && !website && !industry && !goal) return

  const payload = {
    brandName,
    website,
    industry,
    goal,
    updatedAt: Date.now(),
  }

  try {
    sessionStorage.setItem(GUEST_CONTEXT_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearGuestContext() {
  try {
    sessionStorage.removeItem(GUEST_CONTEXT_KEY)
  } catch {
    /* ignore */
  }
}

export function readQuickFillWebsite() {
  try {
    return localStorage.getItem(QUICK_FILL_WEBSITE_KEY) || ''
  } catch {
    return ''
  }
}
