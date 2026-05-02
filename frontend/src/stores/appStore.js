import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { workspaceApi, brandApi, contentApi, templateApi, trendsApi, billingApi } from '../api'
import { planIncludesTrendingTopics } from '../utils/planFeatures'

/** Billing tier for the active workspace (owner subscription pool or row plan). */
function workspacePlanTier(ws) {
  if (!ws) return null
  return ws.effective_plan || ws.plan
}

function normalizeHashtags(raw, caption = '') {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag || '').trim().replace(/^#+/, ''))
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,\s]+/)
      .map((tag) => tag.trim().replace(/^#+/, ''))
      .filter(Boolean)
  }
  const matches = String(caption || '').match(/#([\p{L}\p{N}_]+)/gu) || []
  return matches
    .map((tag) => tag.replace(/^#+/, '').trim())
    .filter(Boolean)
}

function normalizeContentItem(item) {
  const caption = String(
    item?.caption ||
    item?.generated_caption ||
    item?.social_caption ||
    ''
  ).trim()

  return {
    ...item,
    caption,
    hashtags: normalizeHashtags(item?.hashtags, caption),
  }
}

const useAppStore = create(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      brands: [],
      activeBrandId: null,
      // Flips to true once the backend has confirmed the current workspace's
      // brands list (success or failure). Pages should hold their loaded UI
      // until this is true, so persisted activeBrandId doesn't flash an
      // empty state before the real fetch resolves.
      brandsLoaded: false,
      contentByMonth: {},
      generatingMonth: false,
      generationStartedAt: null,
      generationPollCount: 0,
      generationProgress: null,
      // Set when a generation finishes with a non-recoverable error so the
      // UI can show a retry CTA on Home + Calendar. Cleared by retryGeneration
      // and clearGenerationFailure.
      generationFailure: null,  // { reason: string, month: number, year: number }
      // Echo of the last generateMonth() args so retryGeneration() can re-run
      // without the user retyping platform / month / topic / etc.
      lastGenerationRequest: null,
      templates: [],
      templatePlaybookCatalog: null,
      trends: [],
      subscription: null,
      error: null,

      // ── Workspaces ──────────────────────────────────────────────
      fetchWorkspaces: async () => {
        try {
          const workspaces = await workspaceApi.list()
          const savedId = get().activeWorkspaceId
          const active = workspaces.find(w => w.id === savedId) || workspaces[0] || null
          set({ workspaces, activeWorkspaceId: active?.id || null, activeWorkspace: active })
          if (active?.id) {
            await get().fetchBrands(active.id)
            await get().fetchTrends().catch(() => {})
          } else {
            set({ trends: [], brandsLoaded: true })
          }
          return workspaces
        } catch (err) {
          // Unblock pages waiting on brandsLoaded so they don't spin forever
          // when the workspaces fetch itself fails (network, 401, etc.).
          set({ brandsLoaded: true })
          throw err
        }
      },

      setActiveWorkspace: async (id) => {
        const ws = get().workspaces.find(w => w.id === id) || null
        set({
          activeWorkspaceId: id,
          activeWorkspace: ws,
          brands: [],
          activeBrandId: null,
          brandsLoaded: false,
          trends: planIncludesTrendingTopics(workspacePlanTier(ws)) ? get().trends : [],
        })
        if (id) {
          await get().fetchBrands(id)
          await get().fetchTrends().catch(() => {})
        } else {
          set({ brandsLoaded: true })
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
        if (!wsId) {
          set({ brandsLoaded: true })
          return []
        }
        try {
          const brands = await brandApi.list(wsId)
          const savedBrandId = get().activeBrandId
          const activeBrandId = brands.find(b => b.id === savedBrandId)?.id || brands[0]?.id || null
          set({ brands, activeBrandId, brandsLoaded: true })
          return brands
        } catch (err) {
          set({ brandsLoaded: true })
          throw err
        }
      },

      setActiveBrand: (id) => set({ activeBrandId: id }),

      // Push a brand into the active workspace's brands list. Idempotent: a
      // brand_id already in the list is left untouched (so the canonical
      // record from a follow-up fetch isn't overwritten with a stub). Used
      // by onboarding to release the overlay gate as soon as the brand is
      // created, even if the subsequent fetchBrands refresh trips on a
      // transient network blip.
      addBrand: (brand) => {
        if (!brand?.id) return
        set((s) => {
          if (s.brands.some((b) => b.id === brand.id)) {
            return { activeBrandId: s.activeBrandId || brand.id, brandsLoaded: true }
          }
          return {
            brands: [...s.brands, brand],
            activeBrandId: s.activeBrandId || brand.id,
            brandsLoaded: true,
          }
        })
      },

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
        campaign_brief,
      }) => {
        const brandId = get().activeBrandId
        if (!brandId) throw new Error('No active brand selected')
        // Remember the args so retryGeneration() can re-fire without the
        // user re-entering anything. Same shape generateMonth was called
        // with — we just spread it back in retryGeneration.
        const requestSnapshot = {
          month, year, platforms, format_mix, posts_per_week, topic_override,
          template_id, include_holidays_in_content, generation_brief,
          use_website_intelligence, only_new_changes, use_reference_research,
          variant_count, confirm_duplicate, custom_plan, campaign_brief,
        }
        set({
          generatingMonth: true,
          generationStartedAt: Date.now(),
          generationPollCount: 0,
          generationProgress: null,
          generationFailure: null,
          lastGenerationRequest: requestSnapshot,
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
            campaign_brief: campaign_brief || null,
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
                campaign_brief: campaign_brief || null,
                confirm_duplicate: !!confirm_duplicate,
              })
            } else {
              throw e
            }
          }
          const count = await get()._pollForContent(brandId, month, year)
          // Success path — clear failure if any, mark generation as complete.
          set({ generationFailure: null })
          return count
        } catch (err) {
          // Capture failure for the UI banner. The user will see a retry CTA
          // on Home + Calendar that calls retryGeneration() to re-fire the
          // exact same request without re-typing.
          const detail = err?.response?.data?.detail
          const reason =
            (typeof detail === 'string' && detail.trim()) ||
            (detail && typeof detail === 'object' && (detail.message || detail.code)) ||
            err?.message ||
            'Generation failed. Please try again.'
          set({
            generationFailure: { reason: String(reason).slice(0, 400), month, year },
          })
          throw err
        } finally {
          set({ generatingMonth: false, generationStartedAt: null, generationProgress: null })
        }
      },

      // Re-run the last generateMonth call with the same args. Used by the
      // retry button on the Home + Calendar failure banners.
      retryGeneration: async () => {
        const last = get().lastGenerationRequest
        if (!last) {
          throw new Error('No previous generation to retry.')
        }
        set({ generationFailure: null })
        return get().generateMonth(last)
      },

      clearGenerationFailure: () => set({ generationFailure: null }),

      // Poll with exponential backoff. Returns number of posts found.
      //
      // Incremental: every time the server reports more visuals than we saw
      // last poll, we re-fetch the month so newly-ready posts appear in the
      // calendar grid + on the dashboard's "today" card without waiting for
      // the whole batch to finish. The user sees their feed fill up live.
      _pollForContent: async (brandId, month, year) => {
        const maxAttempts = 36
        const delays = [3000, 3000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]
        let lastWithV = -1

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
            // Incremental refetch — any time a new post becomes visually
            // ready, push the freshest list into contentByMonth so the UI
            // shows it immediately. Skip when the count hasn't changed to
            // avoid hammering the list endpoint.
            if (withV > 0 && withV !== lastWithV) {
              try {
                await get().fetchMonthContent(month, year)
              } catch {
                /* best-effort; we'll try again next tick */
              }
              lastWithV = withV
            }
            if (status.ready && withV > 0) {
              const items = await get().fetchMonthContent(month, year)
              return items.length
            }
          } catch (e) {
            if (e.message && !e.message.includes('fetch') && !e.message.includes('Network')) throw e
            const items = await get().fetchMonthContent(month, year)
            if (items.length > 0) return items.length
          }
        }
        const items = await get().fetchMonthContent(month, year)
        if (items.length === 0) {
          throw new Error(
            'Generation is taking longer than expected. Finished posts will appear on the calendar automatically; check back in a minute.'
          )
        }
        return items.length
      },

      fetchMonthContent: async (month, year) => {
        const brandId = get().activeBrandId
        if (!brandId) return []
        const items = (await contentApi.list({ brand_id: brandId, month, year })).map(normalizeContentItem)
        const key = `${year}-${month}`
        set(s => ({ contentByMonth: { ...s.contentByMonth, [key]: items } }))
        return items
      },

      getMonthContent: (month, year) => get().contentByMonth[`${year}-${month}`] || [],

      updateContentItem: async (id, data) => {
        const updated = normalizeContentItem(await contentApi.update(id, data))
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
        const updated = normalizeContentItem(await contentApi.regenerate(id, body))
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
