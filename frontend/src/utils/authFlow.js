const QUICK_FILL_WEBSITE_KEY = 'contentcard.signup.quickFillWebsite'

export function getPostAuthPath(user, fallback = '/dashboard') {
  return user && user.onboarding_completed === false ? '/onboarding' : fallback
}

export function readQuickFillWebsite() {
  try {
    return localStorage.getItem(QUICK_FILL_WEBSITE_KEY) || ''
  } catch {
    return ''
  }
}
