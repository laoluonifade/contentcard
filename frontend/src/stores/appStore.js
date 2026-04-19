import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspaceApi, brandApi, contentApi, templateApi, trendsApi, billingApi } from '../api'
import { planIncludesTrendingTopics } from '../utils/planFeatures'

const useAppStore = create(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      brands: [],
      activeBrandId: null,
      contentByMonth: {},
      generatingMonth: false,
      generationPollCount: 0,
      templates: [],
      trends: [],
      subscription: null,
      error: null,

      // ── Workspaces ──────────────────────────────────────────────
      fetchWorkspaces: async () => {
        const workspaces = await workspaceApi.list()
        const savedId = get().activeWorkspaceId
        const active = workspaces.find(w => w.id === savedId) || workspaces[0] || null
        set({ workspaces, activeWorkspaceId: active?.id || null, activeWorkspace: active })
        if (active?.id) {
          await get().fetchBrands(active.id)
          await get().fetchTrends().catch(() => {})
        } else {
          set({ trends: [] })
        }
        return workspaces
      },

      setActiveWorkspace: async (id) => {
        const ws = get().workspaces.find(w => w.id === id) || null
        set({
          activeWorkspaceId: id,
          activeWorkspace: ws,
          brands: [],
          activeBrandId: null,
          trends: planIncludesTrendingTopics(ws?.plan) ? get().trends : [],
        })
        if (id) {
          await get().fetchBrands(id)
          await get().fetchTrends().catch(() => {})
        }
      },

      // ── Brands ──────────────────────────────────────────────────
      fetchBrands: async (workspaceId) => {
        const wsId = workspaceId || get().activeWorkspaceId
        if (!wsId) return []
        const brands = await brandApi.list(wsId)
        const savedBrandId = get().activeBrandId
        const activeBrandId = brands.find(b => b.id === savedBrandId)?.id || brands[0]?.id || null
        set({ brands, activeBrandId })
        return brands
      },

      setActiveBrand: (id) => set({ activeBrandId: id }),

      createBrand: async (data) => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        const brand = await brandApi.create(wsId, data)
        set(s => ({ brands: [...s.brands, brand], activeBrandId: brand.id }))
        return brand
      },

      updateBrand: async (brandId, data) => {
        const wsId = get().activeWorkspaceId
        const brand = await brandApi.update(wsId, brandId, data)
        set(s => ({ brands: s.brands.map(b => b.id === brandId ? brand : b) }))
        return brand
      },

      // ── Content ─────────────────────────────────────────────────
      generateMonth: async ({ month, year, platforms, format_mix, posts_per_week, topic_override, template_id }) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand selected')
        set({ generatingMonth: true, generationPollCount: 0 })
        try {
          await contentApi.generateMonth({
            brand_id: brandId, month, year, platforms, format_mix,
            posts_per_week: posts_per_week || 3,
            topic_override: topic_override || null, template_id: template_id || null,
          })
          // Poll the status endpoint until content appears (max 60 seconds)
          const count = await get()._pollForContent(brandId, month, year)
          return count
        } finally {
          set({ generatingMonth: false })
        }
      },

      // Poll with exponential backoff — returns number of posts found
      _pollForContent: async (brandId, month, year) => {
        const maxAttempts = 20
        const delays = [3000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]

        for (let i = 0; i < maxAttempts; i++) {
          const delay = delays[Math.min(i, delays.length - 1)]
          await new Promise(r => setTimeout(r, delay))
          set({ generationPollCount: i + 1 })

          try {
            const status = await contentApi.getStatus(brandId, year, month)
            if (status.error) throw new Error(status.error)
            if (status.ready && status.count > 0) {
              const items = await get().fetchMonthContent(month, year)
              return items.length
            }
          } catch (e) {
            if (e.message && !e.message.includes('fetch') && !e.message.includes('Network')) throw e
            // status endpoint network failure — try fetching directly
            const items = await get().fetchMonthContent(month, year)
            if (items.length > 0) return items.length
          }
        }
        // Final attempt: fetch whatever's there, throw if still empty
        const items = await get().fetchMonthContent(month, year)
        if (items.length === 0) throw new Error('Generation timed out — no posts were created. Please try again in a moment.')
        return items.length
      },

      fetchMonthContent: async (month, year) => {
        const brandId = get().activeBrandId
        if (!brandId) return []
        const items = await contentApi.list({ brand_id: brandId, month, year })
        const key = `${year}-${month}`
        set(s => ({ contentByMonth: { ...s.contentByMonth, [key]: items } }))
        return items
      },

      getMonthContent: (month, year) => get().contentByMonth[`${year}-${month}`] || [],

      updateContentItem: async (id, data) => {
        const updated = await contentApi.update(id, data)
        set(s => {
          const cbm = { ...s.contentByMonth }
          for (const k of Object.keys(cbm)) {
            cbm[k] = cbm[k].map(c => c.id === id ? updated : c)
          }
          return { contentByMonth: cbm }
        })
        return updated
      },

      regenerateCaption: async (id, body) => {
        const updated = await contentApi.regenerate(id, body)
        set(s => {
          const cbm = { ...s.contentByMonth }
          for (const k of Object.keys(cbm)) cbm[k] = cbm[k].map(c => c.id === id ? updated : c)
          return { contentByMonth: cbm }
        })
        return updated
      },

      // ── Templates ───────────────────────────────────────────────
      fetchTemplates: async () => {
        const brandId = get().activeBrandId
        if (!brandId) return []
        const templates = await templateApi.list(brandId)
        set({ templates })
        return templates
      },

      createTemplate: async (data) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand')
        const tmpl = await templateApi.create({ ...data, brand_id: brandId })
        set(s => ({ templates: [tmpl, ...s.templates] }))
        return tmpl
      },

      updateTemplate: async (id, data) => {
        const tmpl = await templateApi.update(id, data)
        set(s => ({ templates: s.templates.map(t => t.id === id ? tmpl : t) }))
        return tmpl
      },

      deleteTemplate: async (id) => {
        await templateApi.delete(id)
        set(s => ({ templates: s.templates.filter(t => t.id !== id) }))
      },

      // ── Trends ──────────────────────────────────────────────────
      fetchTrends: async () => {
        const wsId = get().activeWorkspaceId
        const ws = get().activeWorkspace
        if (!wsId || !planIncludesTrendingTopics(ws?.plan)) {
          set({ trends: [] })
          return []
        }
        try {
          const trends = await trendsApi.list(wsId)
          set({ trends })
          return trends
        } catch (e) {
          if (e.response?.status === 403) {
            set({ trends: [] })
            return []
          }
          throw e
        }
      },

      refreshTrends: async () => {
        const wsId = get().activeWorkspaceId
        const ws = get().activeWorkspace
        if (!wsId || !planIncludesTrendingTopics(ws?.plan)) {
          set({ trends: [] })
          return []
        }
        try {
          await trendsApi.refresh(wsId)
          const trends = await trendsApi.list(wsId)
          set({ trends })
          return trends
        } catch (e) {
          if (e.response?.status === 403) {
            set({ trends: [] })
            return []
          }
          throw e
        }
      },

      // ── Billing ─────────────────────────────────────────────────
      fetchSubscription: async () => {
        const wsId = get().activeWorkspaceId
        if (!wsId) return null
        const sub = await billingApi.getSubscription(wsId)
        set({ subscription: sub })
        set(s => ({
          activeWorkspace: s.activeWorkspace
            ? { ...s.activeWorkspace, plan: sub.plan, trial_ends_at: sub.trial_ends_at }
            : s.activeWorkspace,
        }))
        return sub
      },

      createCheckout: async (plan) => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        return billingApi.createCheckout({ plan, workspace_id: wsId })
      },

      cancelSubscription: async () => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        await billingApi.cancelSubscription(wsId)
        await get().fetchSubscription()
      },

      removeCard: async () => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        await billingApi.removeCard(wsId)
        await get().fetchSubscription()
      },

      verifyPaystackSessionWithPlan: async (reference, plan) => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        const result = await billingApi.verifyPaystackSession({ reference, workspace_id: wsId, plan })
        await get().fetchSubscription()
        return result
      },

      removeSavedCard: async () => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        await billingApi.removeCard(wsId)
        await get().fetchSubscription()
      },
    }),
    {
      name: 'contentcard-app',
      partialize: (s) => ({
        activeWorkspaceId: s.activeWorkspaceId,
        activeBrandId: s.activeBrandId,
      }),
    }
  )
)

export default useAppStore
