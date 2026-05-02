// Brand-kit readiness gating was removed: onboarding collects enough to start
// generating, so we no longer block users on additional brand kit fields.
// These helpers are kept as no-ops to avoid breaking any lingering imports.

export const REQUIRED_FIELDS = []

export function getMissingFields() {
  return []
}

export function isBrandReady() {
  return true
}
