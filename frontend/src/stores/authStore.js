import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api'

function formatApiErrorDetail(err) {
  const d = err?.response?.data?.detail
  if (typeof d === 'string' && d.trim()) return d.trim()
  if (Array.isArray(d) && d.length) {
    const parts = d
      .map((x) => (typeof x?.msg === 'string' ? x.msg : typeof x === 'string' ? x : ''))
      .filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  if (d && typeof d === 'object' && typeof d.message === 'string' && d.message.trim()) return d.message.trim()
  return null
}

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      signup: async (data) => {
        set({ isLoading: true, error: null })
        try {
          // Backend returns { email, requires_verification, message } — no token
          // until the user clicks the link in the verification email.
          const res = await authApi.signup(data)
          set({ isLoading: false })
          return res
        } catch (err) {
          const msg =
            formatApiErrorDetail(err) ||
            (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
              ? 'Cannot reach the API server. Hard refresh (Cmd+Shift+R), wait a minute after deploy, or try without VPN/ad blockers.'
              : err.message) ||
            'Signup failed'
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      verifyEmail: async (token) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.verifyEmail({ token })
          set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false })
          return res
        } catch (err) {
          const msg = formatApiErrorDetail(err) || err.message || 'Verification failed'
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      login: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.login(data)
          set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false })
          return res
        } catch (err) {
          const msg =
            formatApiErrorDetail(err) ||
            (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
              ? 'Cannot reach the API server. Hard refresh (Cmd+Shift+R), wait a minute after deploy, or try without VPN/ad blockers.'
              : err.message) ||
            'Login failed'
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      logout: () => set({ user: null, token: null, isAuthenticated: false }),

      deleteAccount: async (password) => {
        set({ isLoading: true, error: null })
        try {
          await authApi.deleteAccount({ password })
          set({ user: null, token: null, isAuthenticated: false, isLoading: false })
        } catch (err) {
          const msg =
            formatApiErrorDetail(err) || err.message || 'Could not delete account'
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      setSession: ({ token, user }) =>
        set({
          token: token || null,
          user: user || null,
          isAuthenticated: Boolean(token),
        }),

      updateUser: (updates) => set(s => ({ user: { ...s.user, ...updates } })),

      fetchMe: async () => {
        try {
          const u = await authApi.me()
          set(s => ({ user: { ...s.user, ...u } }))
          return u
        } catch {
          return null
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'contentcard-auth',
      partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated }),
    }
  )
)

export default useAuthStore
