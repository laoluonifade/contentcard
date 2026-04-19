/** Normalize FastAPI / axios errors for admin console surfaces. */
export function formatAdminApiError(err) {
  const status = err.response?.status
  const d = err.response?.data?.detail
  if (status === 404 && (d === 'Not Found' || !d)) {
    return 'API route not found (404). Check that the backend is deployed with admin routes and VITE_API_URL includes /api/v1.'
  }
  if (!d) return err.message || 'Request failed'
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join('; ')
  return String(d)
}
