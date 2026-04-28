import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api'

function clearPersistedSession() {
  try {
    localStorage.removeItem('contentcard-auth')
    localStorage.removeItem('contentcard-app')
  } catch {
    /* ignore */
  }
}

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
      hasHydrated: false,
      authResolved: false,
      isCheckingAuth: false,
      isLoading: false,
      error: null,

      signup: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.signup(data)
          set({
            user: res.user,
            token: res.access_token,
            isAuthenticated: true,
            authResolved: true,
            isLoading: false,
          })
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

      login: async (data) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.login(data)
          set({
            user: res.user,
            token: res.access_token,
            isAuthenticated: true,
            authResolved: true,
            isLoading: false,
          })
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

      logout: () => {
        clearPersistedSession()
        set({ user: null, token: null, isAuthenticated: false, authResolved: true })
      },

      deleteAccount: async (password) => {
        set({ isLoading: true, error: null })
        try {
          await authApi.deleteAccount({ password })
          clearPersistedSession()
          set({ user: null, token: null, isAuthenticated: false, authResolved: true, isLoading: false })
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
          authResolved: Boolean(token),
        }),

      updateUser: (updates) => set(s => ({ user: { ...s.user, ...updates } })),

      markHydrated: () => set({ hasHydrated: true }),

      bootstrapAuth: async () => {
        const state = useAuthStore.getState()
        if (!state.hasHydrated || state.authResolved || state.isCheckingAuth) return state.isAuthenticated

        if (!state.token) {
          set({ user: null, isAuthenticated: false, authResolved: true })
          return false
        }

        set({ isCheckingAuth: true })
        try {
          const user = await authApi.me()
          set({
            user,
            isAuthenticated: true,
            authResolved: true,
            isCheckingAuth: false,
          })
          return true
        } catch {
          clearPersistedSession()
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            authResolved: true,
            isCheckingAuth: false,
          })
          return false
        }
      },

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
      onRehydrateStorage: () => (state) => {
        state?.markHydrated?.()
      },
    }
  )
)

export default useAuthStore
