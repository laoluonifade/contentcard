/** Mirrors backend `billing_service.plan_includes_trending_topics` and BillingPage copy. */

export function planIncludesTrendingTopics(plan) {
  const p = (plan || '').toString().trim().toLowerCase()
  return p === 'smb' || p === 'pro'
}
