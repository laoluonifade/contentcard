import axios from 'axios'

/**
 * FastAPI mounts all routes under /api/v1. If VITE_API_URL is a bare host
 * (e.g. https://app.onrender.com), requests would hit /admin/... at the root
 * and return 404 — append /api/v1 automatically in that case.
 */
export function normalizeViteApiBaseUrl(v) {
  const s = (v || '').trim().replace(/\/+$/, '')
  if (!s) return '/api/v1'
  if (s.endsWith('/api/v1')) return s
  if (/^https?:\/\/[^/]+$/i.test(s)) return `${s}/api/v1`
  return s
}

const API_BASE = normalizeViteApiBaseUrl(import.meta.env.VITE_API_URL)

const api = axios.create({
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
      localStorage.removeItem('contentcard-auth')
      localStorage.removeItem('contentcard-app')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ──────────────────────────────────────────────────────
export const authApi = {
  signup:         (data) => api.post('/auth/signup', data).then(r => r.data),
  login:          (data) => api.post('/auth/login', data).then(r => r.data),
  me:             ()     => api.get('/auth/me').then(r => r.data),
  updateProfile:  (data) => api.put('/auth/me', data).then(r => r.data),
  changePassword: (data) => api.post('/auth/change-password', data).then(r => r.data),
}

// ─── Workspaces ─────────────────────────────────────────────────
export const workspaceApi = {
  list:   ()     => api.get('/workspaces').then(r => r.data),
  create: (data) => api.post('/workspaces', data).then(r => r.data),
  get:    (id)   => api.get(`/workspaces/${id}`).then(r => r.data),
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
}

// ─── Content ────────────────────────────────────────────────────
export const contentApi = {
  generateMonth:       (data)          => api.post('/content/generate-month', data).then(r => r.data),
  generatePhotoCaption:(data)          => api.post('/content/generate-photo-caption', data).then(r => r.data),
  getStatus:           (brandId, year, month) => api.get(`/content/status/${brandId}/${year}/${month}`).then(r => r.data),
  list:       (params)         => api.get('/content', { params }).then(r => r.data),
  directory:  (workspaceId)   => api.get('/content/directory', { params: { workspace_id: workspaceId } }).then(r => r.data),
  get:        (id)             => api.get(`/content/${id}`).then(r => r.data),
  update:     (id, data)       => api.put(`/content/${id}`, data).then(r => r.data),
  regenerate: (id, data)       => api.post(`/content/${id}/regenerate`, data).then(r => r.data),
  regenerateVisual: (id, data) => api.post(`/content/${id}/regenerate-visual`, data).then(r => r.data),
  delete:     (id)             => api.delete(`/content/${id}`).then(r => r.data),
}

// ─── Templates ──────────────────────────────────────────────────
export const templateApi = {
  list:   (brandId) => api.get('/templates', { params: { brand_id: brandId } }).then(r => r.data),
  create: (data)    => api.post('/templates', data).then(r => r.data),
  get:    (id)      => api.get(`/templates/${id}`).then(r => r.data),
  update: (id, d)   => api.put(`/templates/${id}`, d).then(r => r.data),
  delete: (id)      => api.delete(`/templates/${id}`).then(r => r.data),
}

// ─── Billing ────────────────────────────────────────────────────
export const billingApi = {
  getSubscription:    (wsId) => api.get(`/billing/${wsId}`).then(r => r.data),
  createCheckout:     (data) => api.post('/billing/checkout', data).then(r => r.data),
  cancelSubscription: (wsId) => api.post(`/billing/cancel/${wsId}`).then(r => r.data),
  removeCard:         (wsId) => api.delete(`/billing/card/${wsId}`).then(r => r.data),
}

// ─── Trends ─────────────────────────────────────────────────────
export const trendsApi = {
  list:         (industry) => api.get('/trends', { params: industry ? { industry } : {} }).then(r => r.data),
  refresh:      (industry) => api.post('/trends/refresh', null, { params: industry ? { industry } : {} }).then(r => r.data),
  generatePost: (data)     => api.post('/trends/generate-post', data).then(r => r.data),
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
}

// ─── Holidays ───────────────────────────────────────────────────
export const holidaysApi = {
  list:      (year)       => api.get('/holidays', { params: { year } }).then(r => r.data),
  dismiss:   (date, name) => api.post('/holidays/dismiss', { date, name }),
  undismiss: (date, name) => api.delete('/holidays/dismiss', { data: { date, name } }),
}

// ─── Admin (separate axios instance — never touches contentcard-auth) ──
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
  login:              (data)    => axios.create({ baseURL: API_BASE }).post('/auth/login', data).then(r => r.data),
  stats:              ()        => adminAxios.get('/admin/stats').then(r => r.data),
  users:              (params)  => adminAxios.get('/admin/users', { params }).then(r => r.data),
  workspaces:         (params)  => adminAxios.get('/admin/workspaces', { params }).then(r => r.data),
  reconcileWorkspacePaystack: (workspaceId, data) =>
    adminAxios
      .post(`/admin/workspaces/${encodeURIComponent(workspaceId)}/billing/reconcile-paystack`, data)
      .then((r) => r.data),
  brands:             (params)  => adminAxios.get('/admin/brands', { params }).then(r => r.data),
  content:            (params)  => adminAxios.get('/admin/content', { params }).then(r => r.data),
  deleteContentByUser:(email)   => adminAxios.delete(`/admin/content/by-user/${encodeURIComponent(email)}`).then(r => r.data),
  seedNairaVault:     (email)   => adminAxios.post(`/admin/seed-nairavault/${encodeURIComponent(email)}`).then(r => r.data),
  syncAllAssistants:  ()        => adminAxios.post('/admin/sync-all-assistants').then(r => r.data),
  syncAssistant:      (brandId) => adminAxios.post(`/admin/sync-assistant/${brandId}`).then(r => r.data),
}

export default api
