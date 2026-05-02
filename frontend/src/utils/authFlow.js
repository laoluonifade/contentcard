const QUICK_FILL_WEBSITE_KEY = 'contentcard.signup.quickFillWebsite'

// New users land on /dashboard regardless. The dashboard renders an
// onboarding overlay when user.onboarding_completed === false, so we no
// longer route to a separate /onboarding page after sign-in.
export function getPostAuthPath(_user, fallback = '/dashboard') {
  return fallback
}

export function readQuickFillWebsite() {
  try {
    return localStorage.getItem(QUICK_FILL_WEBSITE_KEY) || ''
  } catch {
    return ''
  }
}
