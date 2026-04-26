import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspaceApi, brandApi, contentApi, templateApi, trendsApi, billingApi } from '../api'
import { planIncludesTrendingTopics } from '../utils/planFeatures'

/** Billing tier for the active workspace (owner subscription pool or row plan). */
function workspacePlanTier(ws) {
  if (!ws) return null
  return ws.effective_plan || ws.plan
}

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
      generationStartedAt: null,
      generationPollCount: 0,
      generationProgress: null,
      templates: [],
      templatePlaybookCatalog: null,
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
          trends: planIncludesTrendingTopics(workspacePlanTier(ws)) ? get().trends : [],
        })
        if (id) {
          await get().fetchBrands(id)
          await get().fetchTrends().catch(() => {})
        }
      },

      createWorkspace: async ({ name }) => {
        const ws = await workspaceApi.create({ name })
        await get().fetchWorkspaces()
        await get().setActiveWorkspace(ws.id)
        return ws
      },

      renameWorkspace: async (workspaceId, name) => {
        const wsId = workspaceId || get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        const trimmed = String(name || '').trim()
        if (!trimmed) throw new Error('Workspace name is required')
        const updated = await workspaceApi.update(wsId, { name: trimmed })
        set((s) => {
          const workspaces = s.workspaces.map((w) => (w.id === wsId ? { ...w, ...updated } : w))
          const activeWorkspace = s.activeWorkspace?.id === wsId ? { ...s.activeWorkspace, ...updated } : s.activeWorkspace
          return { workspaces, activeWorkspace }
        })
        return updated
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
      generateMonth: async ({
        month,
        year,
        platforms,
        format_mix,
        posts_per_week,
        topic_override,
        template_id,
        include_holidays_in_content,
        generation_brief,
        use_website_intelligence,
        only_new_changes,
        use_reference_research,
        variant_count,
        confirm_duplicate,
        custom_plan,
      }) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand selected')
        set({
          generatingMonth: true,
          generationStartedAt: Date.now(),
          generationPollCount: 0,
          generationProgress: null,
        })
        try {
          const reqV2 = {
            brand_id: brandId, month, year, platforms, format_mix,
            posts_per_week: posts_per_week || 3,
            topic_override: topic_override || null, template_id: template_id || null,
            include_holidays_in_content: include_holidays_in_content !== false,
            use_reference_research: use_reference_research !== false,
            variant_count: Number(variant_count || 2),
            generation_brief: generation_brief || null,
            use_website_intelligence: use_website_intelligence !== false,
            only_new_changes: !!only_new_changes,
            confirm_duplicate: !!confirm_duplicate,
            custom_plan: Array.isArray(custom_plan) && custom_plan.length > 0 ? custom_plan : null,
          }
          try {
            await contentApi.generateMonthV2(reqV2)
          } catch (e) {
            const status = Number(e?.response?.status || 0)
            // Production safety net: if v2 backend is unavailable or throws transient 5xx/network errors,
            // fall back to v1 so users can still generate content instead of seeing a dead-end error.
            if (!status || status >= 500) {
              await contentApi.generateMonth({
                brand_id: brandId, month, year, platforms, format_mix,
                posts_per_week: posts_per_week || 3,
                topic_override: topic_override || null,
                template_id: template_id || null,
                include_holidays_in_content: include_holidays_in_content !== false,
                generation_brief: generation_brief || null,
                confirm_duplicate: !!confirm_duplicate,
              })
            } else {
              throw e
            }
          }
          const count = await get()._pollForContent(brandId, month, year, Number(baseline_total || 0))
          return count
        } finally {
          set({ generatingMonth: false, generationStartedAt: null, generationProgress: null })
        }
      },

      // Poll with exponential backoff: returns number of posts found
      _pollForContent: async (brandId, month, year, baselineTotal = 0) => {
        const maxAttempts = 36
        const delays = [3000, 3000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]

        for (let i = 0; i < maxAttempts; i++) {
          const delay = delays[Math.min(i, delays.length - 1)]
          await new Promise(r => setTimeout(r, delay))
          set({ generationPollCount: i + 1 })

          try {
            const status = await contentApi.getStatus(brandId, year, month)
            if (status.error) throw new Error(status.error)
            const withV = status.with_visuals ?? status.count ?? 0
            const total = status.total ?? withV
            set({
              generationProgress: total > 0
                ? { with: withV, total }
                : { with: 0, total: 0 },
            })
            if (status.ready && total > baselineTotal) {
              const items = await get().fetchMonthContent(month, year)
              return items.length
            }
          } catch (e) {
            if (e.message && !e.message.includes('fetch') && !e.message.includes('Network')) throw e
            const items = await get().fetchMonthContent(month, year)
            if (items.length > baselineTotal) return items.length
          }
        }
        const items = await get().fetchMonthContent(month, year)
        if (items.length <= baselineTotal) {
          throw new Error(
            'Generation request was accepted but no new posts were created yet. This usually means the worker failed or is still processing. Please retry once and check again in 1-2 minutes.'
          )
        }
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

      fetchTemplatePlaybookCatalog: async () => {
        const brandId = get().activeBrandId
        if (!brandId) return null
        const catalog = await templateApi.playbookCatalog(brandId)
        set({ templatePlaybookCatalog: catalog })
        return catalog
      },

      createTemplate: async (data) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand')
        const tmpl = await templateApi.create({ ...data, brand_id: brandId })
        set(s => ({ templates: [tmpl, ...s.templates] }))
        return tmpl
      },

      bootstrapDefaultTemplates: async ({ force = false, generate_designs = true } = {}) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand')
        const rows = await templateApi.bootstrapDefaults({ brand_id: brandId, force, generate_designs })
        set({ templates: rows })
        return rows
      },

      generateTemplateDesign: async (id, data = {}) => {
        const tmpl = await templateApi.generateDesign(id, data)
        set(s => ({ templates: s.templates.map(t => t.id === id ? tmpl : t) }))
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
        if (!wsId || !planIncludesTrendingTopics(workspacePlanTier(ws))) {
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
        if (!wsId || !planIncludesTrendingTopics(workspacePlanTier(ws))) {
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
            ? {
                ...s.activeWorkspace,
                plan: sub.plan,
                effective_plan: sub.plan,
                trial_ends_at: sub.trial_ends_at,
              }
            : s.activeWorkspace,
        }))
        return sub
      },

      createCheckout: async (plan, currency = 'NGN') => {
        const wsId = get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        return billingApi.createCheckout({ plan, workspace_id: wsId, currency })
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
