import axios from 'axios'

/** Production API on Render (static site cannot serve /api/v1). */
export const CONTENTCARD_RENDER_API_BASE = 'https://contentcard-backend.onrender.com/api/v1'

/**
 * FastAPI mounts all routes under /api/v1. If VITE_API_URL is a bare host
 * (e.g. https://app.onrender.com), requests would hit /admin/... at the root
 * and return 404: append /api/v1 automatically in that case.
 */
export function normalizeViteApiBaseUrl(v) {
  const s = (v || '').trim().replace(/\/+$/, '')
  if (!s) return '/api/v1'
  if (s.endsWith('/api/v1')) return s
  if (/^https?:\/\/[^/]+$/i.test(s)) return `${s}/api/v1`
  return s
}

function isRenderStaticFrontendHostname(hostname) {
  const h = String(hostname || '').toLowerCase()
  if (!h.endsWith('.onrender.com')) return false
  return h !== 'contentcard-backend.onrender.com'
}

/**
 * Resolves axios baseURL. On Render *static* sites, relative /api/v1 hits the CDN (network error).
 * Also corrects common misconfigs: VITE_API_URL pointing at the frontend origin, or http on an https page.
 */
export function resolveContentCardApiBase() {
  const rawEnv = (import.meta.env.VITE_API_URL || '').trim()
  let base = normalizeViteApiBaseUrl(import.meta.env.VITE_API_URL)

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (isRenderStaticFrontendHostname(host)) {
      if (!rawEnv || base === '/api/v1') return CONTENTCARD_RENDER_API_BASE
      try {
        const resolved = base.startsWith('http') ? base : `${window.location.origin}${base.startsWith('/') ? '' : '/'}${base}`
        if (new URL(resolved).origin === window.location.origin) return CONTENTCARD_RENDER_API_BASE
      } catch {
        /* keep base */
      }
      if (window.location.protocol === 'https:' && /^http:\/\//i.test(rawEnv)) return CONTENTCARD_RENDER_API_BASE
    }
  }

  return base
}

const API_BASE = resolveContentCardApiBase()

/** Join API root (absolute URL or path) with path like `/auth/login`. */
function joinApiUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '')
  const norm = p.startsWith('/') ? p : `/${p}`
  return `${b}${norm}`
}

/** One retry after a short delay for cold Render / flaky TLS (same URL only). */
async function axiosPostWithRetry(url, data, headers) {
  try {
    return await axios.post(url, data, { headers }).then((r) => r.data)
  } catch (err) {
    const transient =
      !err?.response && /^https:\/\/contentcard-backend\.onrender\.com/i.test(String(url))
    if (transient) {
      await new Promise((r) => setTimeout(r, 900))
      return axios.post(url, data, { headers }).then((r) => r.data)
    }
    throw err
  }
}

async function axiosGetWithRetry(url, params, headers) {
  try {
    return await axios.get(url, { params, headers }).then((r) => r.data)
  } catch (err) {
    const transient =
      !err?.response && /^https:\/\/contentcard-backend\.onrender\.com/i.test(String(url))
    if (transient) {
      await new Promise((r) => setTimeout(r, 900))
      return axios.get(url, { params, headers }).then((r) => r.data)
    }
    throw err
  }
}

/**
 * Unauthenticated auth calls use absolute URLs + optional fallback so the browser
 * never hits the static site for `/api/v1/auth/*` (shows as "login" / preflight failed).
 */
function postPublicAuth(path, data) {
  const primaryUrl = joinApiUrl(resolveContentCardApiBase(), path)
  const fallbackUrl = joinApiUrl(CONTENTCARD_RENDER_API_BASE, path)
  const headers = { 'Content-Type': 'application/json' }
  return axiosPostWithRetry(primaryUrl, data, headers).catch((err) => {
    const networkFailure = !err?.response
    const canFallback =
      networkFailure && primaryUrl !== fallbackUrl && /^https?:\/\//i.test(String(primaryUrl))
    if (canFallback) return axiosPostWithRetry(fallbackUrl, data, headers)
    throw err
  })
}

function getPublicAuth(path, params) {
  const primaryUrl = joinApiUrl(resolveContentCardApiBase(), path)
  const fallbackUrl = joinApiUrl(CONTENTCARD_RENDER_API_BASE, path)
  const headers = { 'Content-Type': 'application/json' }
  return axiosGetWithRetry(primaryUrl, params, headers).catch((err) => {
    const networkFailure = !err?.response
    const canFallback =
      networkFailure && primaryUrl !== fallbackUrl && /^https?:\/\//i.test(String(primaryUrl))
    if (canFallback) return axiosGetWithRetry(fallbackUrl, params, headers)
    throw err
  })
}

function isPublicAuthRequest(err) {
  const cfg = err.config || {}
  const combined = `${cfg.baseURL || ''}${cfg.url || ''}`
  return /auth\/(login|signup)(\?|$|\/)/i.test(combined) || /auth\/shopify\/start/i.test(combined)
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

/** Unauthenticated marketing endpoints (no user Bearer token, no 401 redirect). */
const publicApi = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('contentcard-auth')
    const token = stored ? JSON.parse(stored)?.state?.token : null
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {}
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (isPublicAuthRequest(err)) return Promise.reject(err)
      localStorage.removeItem('contentcard-auth')
      localStorage.removeItem('contentcard-app')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ──────────────────────────────────────────────────────
export const marketingApi = {
  submitDemoRequest: (data) => publicApi.post('/public/demo-request', data).then((r) => r.data),
}

export const authApi = {
  signup:         (data) => postPublicAuth('/auth/signup', data),
  login:          (data) => postPublicAuth('/auth/login', data),
  me:             ()     => api.get('/auth/me').then(r => r.data),
  updateProfile:  (data) => api.put('/auth/me', data).then(r => r.data),
  changePassword: (data) => api.post('/auth/change-password', data).then(r => r.data),
  deleteAccount:    (data) => api.delete('/auth/me', { data }).then(r => r.data),
  forgotPassword:   (data) => postPublicAuth('/auth/forgot-password', data),
  resetPassword:    (data) => postPublicAuth('/auth/reset-password', data),
  verifyEmail:        (data) => postPublicAuth('/auth/verify-email', data),
  resendVerification: (data) => postPublicAuth('/auth/resend-verification', data),
  shopifyStart:   (params) => getPublicAuth('/auth/shopify/start', params),
  shopifyOnboardingStatus: () => api.get('/auth/shopify/onboarding-status').then(r => r.data),
  completeShopifyOnboarding: (data) => api.post('/auth/shopify/onboarding-complete', data).then(r => r.data),
  getPostSignupDecision: () => api.get('/auth/post-signup-decision').then(r => r.data),
  setPostSignupDecision: (decision) => api.post('/auth/post-signup-decision', { decision }).then(r => r.data),
  getEmailPreferences:    ()     => api.get('/auth/me/email-preferences').then(r => r.data),
  updateEmailPreferences: (data) => api.put('/auth/me/email-preferences', data).then(r => r.data),
}

// ─── Workspaces ─────────────────────────────────────────────────
export const workspaceApi = {
  list:   ()     => api.get('/workspaces').then(r => r.data),
  create: (data) => api.post('/workspaces', data).then(r => r.data),
  get:    (id)   => api.get(`/workspaces/${id}`).then(r => r.data),
  update: (id, data) => api.put(`/workspaces/${id}`, data).then(r => r.data),
  members: (id)  => api.get(`/workspaces/${id}/members`).then(r => r.data),
  updateMemberRole: (wsId, memberId, role) =>
    api.put(`/workspaces/${wsId}/members/${memberId}`, { role }).then(r => r.data),
  removeMember: (wsId, memberId) =>
    api.delete(`/workspaces/${wsId}/members/${memberId}`).then(r => r.data),
}

// ─── Invites ────────────────────────────────────────────────────
export const inviteApi = {
  send:       (wsId, data) => api.post(`/workspaces/${wsId}/invites`, data).then(r => r.data),
  list:       (wsId)       => api.get(`/workspaces/${wsId}/invites`).then(r => r.data),
  cancel:     (wsId, id)   => api.delete(`/workspaces/${wsId}/invites/${id}`).then(r => r.data),
  getDetails: (token)      => api.get(`/invites/${token}`).then(r => r.data),
  accept:     (token, data)=> api.post(`/invites/${token}/accept`, data).then(r => r.data),
}

// ─── Brands ─────────────────────────────────────────────────────
export const brandApi = {
  list:   (wsId)              => api.get(`/workspaces/${wsId}/brands`).then(r => r.data),
  create: (wsId, data)        => api.post(`/workspaces/${wsId}/brands`, data).then(r => r.data),
  get:    (wsId, brandId)     => api.get(`/workspaces/${wsId}/brands/${brandId}`).then(r => r.data),
  update: (wsId, brandId, d)  => api.put(`/workspaces/${wsId}/brands/${brandId}`, d).then(r => r.data),
  delete: (wsId, brandId)     => api.delete(`/workspaces/${wsId}/brands/${brandId}`).then(r => r.data),
  uploadLogo: (wsId, brandId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/workspaces/${wsId}/brands/${brandId}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  aiInsights: (wsId, brandId) => api.post(`/workspaces/${wsId}/brands/${brandId}/ai-insights`).then(r => r.data),
  uploadPhoto: (wsId, brandId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/workspaces/${wsId}/brands/${brandId}/photos`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  deletePhoto: (wsId, brandId, idx) =>
    api.delete(`/workspaces/${wsId}/brands/${brandId}/photos/${idx}`).then(r => r.data),
  syncWebsite: (wsId, brandId, data = {}) =>
    api.post(`/workspaces/${wsId}/brands/${brandId}/website/sync`, data).then(r => r.data),
  websiteStatus: (wsId, brandId) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/website/status`).then(r => r.data),
  websiteEntities: (wsId, brandId, params = {}) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/website/entities`, { params }).then(r => r.data),
  websiteProducts: (wsId, brandId, params = {}) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/website/products`, { params }).then(r => r.data),
  createWebsiteProduct: (wsId, brandId, data) =>
    api.post(`/workspaces/${wsId}/brands/${brandId}/website/products`, data).then(r => r.data),
  deleteWebsiteProduct: (wsId, brandId, productId) =>
    api.delete(`/workspaces/${wsId}/brands/${brandId}/website/products/${productId}`).then(r => r.data),
  websiteChanges: (wsId, brandId, params = {}) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/website/changes`, { params }).then(r => r.data),
  websiteOpportunities: (wsId, brandId, params = {}) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/website/opportunities`, { params }).then(r => r.data),
  updateWebsiteOpportunity: (wsId, brandId, opportunityId, status) =>
    api.patch(`/workspaces/${wsId}/brands/${brandId}/website/opportunities/${opportunityId}`, { status }).then(r => r.data),
  configureAuthCapture: (wsId, brandId, data) =>
    api.post(`/workspaces/${wsId}/brands/${brandId}/auth-capture/config`, data).then(r => r.data),
  runAuthCapture: (wsId, brandId, data = {}) =>
    api.post(`/workspaces/${wsId}/brands/${brandId}/auth-capture/run`, data).then(r => r.data),
  screenshotAssetStatus: (wsId, brandId) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/assets/screenshots/status`).then(r => r.data),
  syncReferences: (wsId, brandId, data = {}) =>
    api.post(`/workspaces/${wsId}/brands/${brandId}/references/sync`, data).then(r => r.data),
  referenceStatus: (wsId, brandId) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/references/status`).then(r => r.data),
  styleFingerprint: (wsId, brandId) =>
    api.get(`/workspaces/${wsId}/brands/${brandId}/style-fingerprint`).then(r => r.data),
}

// ─── Content ────────────────────────────────────────────────────
export const contentApi = {
  generateMonth:       (data)          => api.post('/content/generate-month', data).then(r => r.data),
  generateMonthV2:     (data)          => api.post('/content/generate-month-v2', data).then(r => r.data),
  generationPrepChat:  (data)          => api.post('/content/generation-prep-chat', data).then(r => r.data),
  prepExecuteVisual:     (data)          => api.post('/content/prep-execute-visual', data).then(r => r.data),
  brandFormCoach:      (data)          => api.post('/content/brand-form-coach', data).then(r => r.data),
  bulkRemoveFromCalendar: (data)      => api.post('/content/bulk-remove-from-calendar', data).then(r => r.data),
  bulkDelete:            (data)       => api.post('/content/bulk-delete', data).then(r => r.data),
  generatePhotoCaption:(data)          => api.post('/content/generate-photo-caption', data).then(r => r.data),
  getStatus:           (brandId, year, month) => api.get(`/content/status/${brandId}/${year}/${month}`).then(r => r.data),
  list:       (params)         => api.get('/content', { params }).then(r => r.data),
  directory:  (workspaceId)   => api.get('/content/directory', { params: { workspace_id: workspaceId } }).then(r => r.data),
  memes:      ()              => api.get('/content/memes').then(r => r.data),
  addMeme:    (data)          => api.post('/content/memes', data).then(r => r.data),
  deleteMeme: (id)            => api.delete(`/content/memes/${id}`).then(r => r.data),
  get:        (id)             => api.get(`/content/${id}`).then(r => r.data),
  update:     (id, data)       => api.put(`/content/${id}`, data).then(r => r.data),
  regenerate: (id, data)       => api.post(`/content/${id}/regenerate`, data).then(r => r.data),
  regenerateVisual: (id, data) => api.post(`/content/${id}/regenerate-visual`, data).then(r => r.data),
  approve:    (id)             => api.post(`/content/${id}/approve`).then(r => r.data),
  reject:     (id)             => api.post(`/content/${id}/reject`).then(r => r.data),
  delete:     (id)             => api.delete(`/content/${id}`).then(r => r.data),
}

// ─── Telemetry ──────────────────────────────────────────────────
export const telemetryApi = {
  recordEvents: (events) => api.post('/telemetry/events', { events }).then(r => r.data),
}

// ─── Dashboard ──────────────────────────────────────────────────
export const dashboardApi = {
  socialEvents: (brandId, limit = 5) =>
    api.get('/dashboard/social-events', { params: { brand_id: brandId, limit } }).then(r => r.data),
  streak: (brandId) =>
    api.get('/dashboard/streak', { params: { brand_id: brandId } }).then(r => r.data),
  briefing: (brandId, refresh = false) =>
    api.get('/dashboard/briefing', { params: { brand_id: brandId, refresh } }).then(r => r.data),
  bestPost: (brandId, windowDays = 30) =>
    api.get('/dashboard/best-post', { params: { brand_id: brandId, window_days: windowDays } }).then(r => r.data),
  monthlyRecap: (brandId, month, year) =>
    api.get('/dashboard/monthly-recap', { params: { brand_id: brandId, month, year } }).then(r => r.data),
  activation: (brandId) =>
    api.get('/dashboard/activation', { params: { brand_id: brandId } }).then(r => r.data),
}

// ─── Content extras (remix / variants / brand-fit / explanation / comments / activity)
export const contentExtrasApi = {
  remix: (id, recipe) => api.post(`/content/${id}/remix`, { recipe }).then(r => r.data),
  variants: (id) => api.post(`/content/${id}/variants`).then(r => r.data),
  brandFit: (id) => api.get(`/content/${id}/brand-fit`).then(r => r.data),
  explanation: (id) => api.get(`/content/${id}/explanation`).then(r => r.data),
  listComments: (id) => api.get(`/content/${id}/comments`).then(r => r.data),
  addComment: (id, data) => api.post(`/content/${id}/comments`, data).then(r => r.data),
  listActivity: (id) => api.get(`/content/${id}/activity`).then(r => r.data),
}

// ─── Inbox ──────────────────────────────────────────────────────
export const inboxApi = {
  list: (params) => api.get('/inbox', { params }).then(r => r.data),
  markSpam: (id) => api.post(`/inbox/${id}/spam`).then(r => r.data),
}

// ─── Analytics ──────────────────────────────────────────────────
export const analyticsApi = {
  summary: (brandId, windowDays = 30, platform) =>
    api.get('/analytics/summary', { params: { brand_id: brandId, window_days: windowDays, platform } }).then(r => r.data),
  competitors: (brandId) =>
    api.get('/analytics/competitors', { params: { brand_id: brandId } }).then(r => r.data),
  scheduleReport: (data) =>
    api.post('/analytics/report', data).then(r => r.data),
}

// ─── Social Autopilot ───────────────────────────────────────────
export const socialApi = {
  connect: (platform, data) =>
    api.post(`/social/connections/${encodeURIComponent(platform)}/connect`, data).then((r) => r.data),
  disconnect: (platform, data) =>
    api.post(`/social/connections/${encodeURIComponent(platform)}/disconnect`, data).then((r) => r.data),
  oauthStart: (platform, data) =>
    api.post(`/social/connections/${encodeURIComponent(platform)}/oauth/start`, data).then((r) => r.data),
  listConnections: (brandId) =>
    api.get('/social/connections', { params: { brand_id: brandId } }).then((r) => r.data),
  connectionHealth: (brandId) =>
    api.get('/social/connections/health', { params: { brand_id: brandId } }).then((r) => r.data),
  getAutopilotConfig: (brandId) =>
    api.get('/social/autopilot/config', { params: { brand_id: brandId } }).then((r) => r.data),
  upsertAutopilotConfig: (data) =>
    api.post('/social/autopilot/config', data).then((r) => r.data),
  queuePost: (data) =>
    api.post('/social/posts/queue', data).then((r) => r.data),
  manualConfirmPost: (data) =>
    api.post('/social/posts/manual-confirm', data).then((r) => r.data),
  preflight: (data) =>
    api.post('/social/publish/preflight', data).then((r) => r.data),
  listPosts: (params) =>
    api.get('/social/posts', { params }).then((r) => r.data),
  deadLetterPosts: (brandId, limit = 100) =>
    api.get('/social/posts/dead-letter', { params: { brand_id: brandId, limit } }).then((r) => r.data),
  retryPost: (postId) =>
    api.post(`/social/posts/${encodeURIComponent(postId)}/retry`).then((r) => r.data),
  listComments: (brandId, limit = 100) =>
    api.get('/social/comments', { params: { brand_id: brandId, limit } }).then((r) => r.data),
  replyToComment: (commentId, data) =>
    api.post(`/social/comments/${encodeURIComponent(commentId)}/reply`, data).then((r) => r.data),
  metricsSummary: (brandId, windowDays = 30) =>
    api.get('/social/metrics/summary', { params: { brand_id: brandId, window_days: windowDays } }).then((r) => r.data),
  opsAlerts: (brandId) =>
    api.get('/social/ops/alerts', { params: { brand_id: brandId } }).then((r) => r.data),
}

// ─── Templates ──────────────────────────────────────────────────
export const templateApi = {
  list:   (brandId) => api.get('/templates', { params: { brand_id: brandId } }).then(r => r.data),
  playbookCatalog: (brandId) => api.get('/templates/playbook-catalog', { params: { brand_id: brandId } }).then(r => r.data),
  create: (data)    => api.post('/templates', data).then(r => r.data),
  bootstrapDefaults: (data) => api.post('/templates/bootstrap-defaults', data).then(r => r.data),
  get:    (id)      => api.get(`/templates/${id}`).then(r => r.data),
  generateDesign: (id, data = {}) => api.post(`/templates/${id}/generate-design`, data).then(r => r.data),
  update: (id, d)   => api.put(`/templates/${id}`, d).then(r => r.data),
  delete: (id)      => api.delete(`/templates/${id}`).then(r => r.data),
}

// ─── Billing ────────────────────────────────────────────────────
export const billingApi = {
  getSubscription:    (wsId) => api.get(`/billing/${wsId}`).then(r => r.data),
  createCheckout:     (data) => api.post('/billing/checkout', data).then(r => r.data),
  cancelSubscription: (wsId) => api.post(`/billing/cancel/${wsId}`).then(r => r.data),
  removeCard:         (wsId) => api.delete(`/billing/card/${wsId}`).then(r => r.data),
  // Inline (no-redirect) card collection
  inlineCheckout:    (data) => api.post('/billing/inline-checkout', data).then(r => r.data),
  cardSave:          (data) => api.post('/billing/card-save', data).then(r => r.data),
  cardSaveComplete:  (data) => api.post('/billing/card-save/complete', data).then(r => r.data),
}

// ─── Trends ─────────────────────────────────────────────────────
export const trendsApi = {
  list: (workspaceId, industry) => {
    const params = { workspace_id: workspaceId }
    if (industry) params.industry = industry
    return api.get('/trends', { params }).then((r) => r.data)
  },
  refresh: (workspaceId, industry) => {
    const params = { workspace_id: workspaceId }
    if (industry) params.industry = industry
    return api.post('/trends/refresh', null, { params }).then((r) => r.data)
  },
  generatePost: (data) => api.post('/trends/generate-post', data).then((r) => r.data),
}

// ─── Upload ─────────────────────────────────────────────────────
export const uploadApi = {
  photo: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/upload/photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  prepAsset: (file, assetKind = 'auto') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('asset_kind', assetKind)
    return api.post('/upload/prep-asset', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}

// ─── Holidays ───────────────────────────────────────────────────
export const holidaysApi = {
  list:      (year)       => api.get('/holidays', { params: { year } }).then(r => r.data),
  dismiss:   (date, name) => api.post('/holidays/dismiss', { date, name }),
  undismiss: (date, name) => api.delete('/holidays/dismiss', { data: { date, name } }),
}

// ─── Admin (separate axios instance: never touches contentcard-auth) ──
const adminAxios = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

adminAxios.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('contentcard-admin-token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch {}
  return config
})

adminAxios.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('contentcard-admin-token')
      localStorage.removeItem('contentcard-admin')
      window.location.href = '/adminlogin'
    }
    return Promise.reject(err)
  }
)

export const adminApi = {
  login:              (data)    => postPublicAuth('/auth/login', data),
  stats:              ()        => adminAxios.get('/admin/stats').then(r => r.data),
  users:              (params)  => adminAxios.get('/admin/users', { params }).then(r => r.data),
  bootstrapSalesSandbox: (data) => adminAxios.post('/admin/sales-sandbox/bootstrap', data).then(r => r.data),
  workspaces:         (params)  => adminAxios.get('/admin/workspaces', { params }).then(r => r.data),
  adoptWorkspaceOwner: (workspaceId, data) =>
    adminAxios.post(`/admin/workspaces/${encodeURIComponent(workspaceId)}/adopt-owner`, data).then(r => r.data),
  reconcileWorkspacePaystack: (workspaceId, data) =>
    adminAxios
      .post(`/admin/workspaces/${encodeURIComponent(workspaceId)}/billing/reconcile-paystack`, data)
      .then((r) => r.data),
  designPlaybook:     ()        => adminAxios.get('/admin/design-playbook').then(r => r.data),
  designPlaybookDepth: ()       => adminAxios.get('/admin/design-playbook-depth').then(r => r.data),
  designPlaybookCompleteness: (params) => adminAxios.get('/admin/design-playbook-completeness', { params }).then(r => r.data),
  fillDesignPlaybookDepth: ()   => adminAxios.post('/admin/design-playbook/fill-depth').then(r => r.data),
  createPlaybookIndustry: (data) => adminAxios.post('/admin/design-playbook/industries', data).then(r => r.data),
  updatePlaybookIndustry: (industryId, data) => adminAxios.put(`/admin/design-playbook/industries/${industryId}`, data).then(r => r.data),
  deletePlaybookIndustry: (industryId) => adminAxios.delete(`/admin/design-playbook/industries/${industryId}`).then(r => r.data),
  createPlaybookContentType: (data) => adminAxios.post('/admin/design-playbook/content-types', data).then(r => r.data),
  updatePlaybookContentType: (contentTypeId, data) => adminAxios.put(`/admin/design-playbook/content-types/${contentTypeId}`, data).then(r => r.data),
  fillAndActivatePlaybookContentType: (contentTypeId) =>
    adminAxios.post(`/admin/design-playbook/content-types/${contentTypeId}/fill-and-activate`).then(r => r.data),
  deletePlaybookContentType: (contentTypeId) => adminAxios.delete(`/admin/design-playbook/content-types/${contentTypeId}`).then(r => r.data),
  createPlaybookVisualDirection: (data) => adminAxios.post('/admin/design-playbook/visual-directions', data).then(r => r.data),
  updatePlaybookVisualDirection: (visualDirectionId, data) => adminAxios.put(`/admin/design-playbook/visual-directions/${visualDirectionId}`, data).then(r => r.data),
  deletePlaybookVisualDirection: (visualDirectionId) => adminAxios.delete(`/admin/design-playbook/visual-directions/${visualDirectionId}`).then(r => r.data),
  brands:             (params)  => adminAxios.get('/admin/brands', { params }).then(r => r.data),
  repairBrandTaxonomy: (params) => adminAxios.post('/admin/brands/repair-taxonomy', null, { params }).then(r => r.data),
  generateBrandMonth: (brandId, data) =>
    adminAxios.post(`/admin/brands/${encodeURIComponent(brandId)}/generate-month`, data).then(r => r.data),
  content:            (params)  => adminAxios.get('/admin/content', { params }).then(r => r.data),
  memes:              ()        => adminAxios.get('/admin/memes').then(r => r.data),
  demoRequests:       (params)  => adminAxios.get('/admin/demo-requests', { params }).then(r => r.data),
  addMeme:            (data)    => adminAxios.post('/admin/memes', data).then(r => r.data),
  deleteMeme:         (id)      => adminAxios.delete(`/admin/memes/${encodeURIComponent(id)}`).then(r => r.data),
  deleteContentByUser:(email)   => adminAxios.delete(`/admin/content/by-user/${encodeURIComponent(email)}`).then(r => r.data),
  seedNairaVault:     (email)   => adminAxios.post(`/admin/seed-nairavault/${encodeURIComponent(email)}`).then(r => r.data),
  syncAllAssistants:  ()        => adminAxios.post('/admin/sync-all-assistants').then(r => r.data),
  syncAssistant:      (brandId) => adminAxios.post(`/admin/sync-assistant/${brandId}`).then(r => r.data),
  creativeQualityV2:  (params)  => adminAxios.get('/admin/creative-quality-report-v2', { params }).then(r => r.data),
}

export default api
