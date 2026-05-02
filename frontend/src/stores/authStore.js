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

function isFatalAuthFailure(err) {
  const status = Number(err?.response?.status || 0)
  return status === 401 || status === 403
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

      requestOtp: async (email) => {
        set({ isLoading: true, error: null })
        try {
          await authApi.requestOtp(email)
          set({ isLoading: false })
        } catch (err) {
          const msg =
            formatApiErrorDetail(err) ||
            (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
              ? 'Cannot reach the API server. Hard refresh (Cmd+Shift+R), wait a minute after deploy, or try without VPN/ad blockers.'
              : err.message) ||
            "We couldn't send your code. Try again in a moment."
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      verifyOtp: async (email, code) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.verifyOtp(email, code)
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
            "That code didn't check out. Try again."
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      logout: () => {
        clearPersistedSession()
        set({ user: null, token: null, isAuthenticated: false, authResolved: true })
      },

      deleteAccount: async () => {
        set({ isLoading: true, error: null })
        try {
          await authApi.deleteAccount()
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
        } catch (err) {
          if (isFatalAuthFailure(err)) {
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

          // Keep the persisted session on transient failures so refreshes
          // or backend cold starts do not kick signed-in users out.
          set({
            user: state.user,
            isAuthenticated: true,
            authResolved: true,
            isCheckingAuth: false,
          })
          return true
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
