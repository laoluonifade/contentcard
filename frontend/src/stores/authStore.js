import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api'

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
          const res = await authApi.signup(data)
          set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false })
          return res
        } catch (err) {
          const msg =
            err.response?.data?.detail ||
            (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
              ? 'Cannot reach the server. Check your connection or try again in a moment.'
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
          set({ user: res.user, token: res.access_token, isAuthenticated: true, isLoading: false })
          return res
        } catch (err) {
          const msg =
            err.response?.data?.detail ||
            (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
              ? 'Cannot reach the server. Check your connection or try again in a moment.'
              : err.message) ||
            'Login failed'
          set({ error: msg, isLoading: false })
          throw new Error(msg)
        }
      },

      logout: () => set({ user: null, token: null, isAuthenticated: false }),

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
