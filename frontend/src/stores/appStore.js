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

      // Set the workspace-level default currency (ISO 4217 string or
      // empty to clear). Reused by the products page and the settings
      // UI, so kept in the store rather than duplicated in two places.
      setWorkspaceCurrency: async (workspaceId, currency) => {
        const wsId = workspaceId || get().activeWorkspaceId
        if (!wsId) throw new Error('No active workspace')
        const cleaned = String(currency || '').trim().toUpperCase()
        const updated = await workspaceApi.update(wsId, { default_currency: cleaned })
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

        // Snapshot the existing post counts BEFORE the kickoff so the
        // polling loop can tell "still has the previous batch" apart from
        // "the new run has finished". Without this, /content/status
        // returns the stale 7/7 from a prior generation on the very first
        // poll and the loader exits in 3 seconds with a misleading
        // success — exactly what the user reported.
        let baseline = { with: 0, total: 0 }
        try {
          const status0 = await contentApi.getStatus(brandId, year, month)
          baseline = {
            with: Number(status0?.with_visuals ?? status0?.count ?? 0),
            total: Number(status0?.total ?? 0),
          }
        } catch {
          /* If the baseline probe fails, treat as zero — worst case
             a brand-new month polls one extra cycle. */
        }
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
          const count = await get()._pollForContent(brandId, month, year, baseline)
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

      // Reattach the loader after a page refresh.
      //
      // /content/status now exposes `active_generation` when the backend
      // has a run in flight on this brand for this month. If we're not
      // already polling, we set generatingMonth=true and resume polling
      // without re-firing generateMonthV2 — the backend's run is still
      // working in the background.
      //
      // No-op if generatingMonth is already true (we're already polling),
      // if no active brand, or if active_generation is missing/stale.
      resumeActiveGenerationIfAny: async (month, year) => {
        const brandId = get().activeBrandId
        if (!brandId || !month || !year) return false
        if (get().generatingMonth) return false
        let status0
        try {
          status0 = await contentApi.getStatus(brandId, year, month)
        } catch {
          return false
        }
        const active = status0?.active_generation
        if (!active || active.stale) return false
        if (Number(active.month) !== Number(month) || Number(active.year) !== Number(year)) {
          return false
        }
        const startedAtMs = (() => {
          if (!active.started_at) return Date.now()
          const t = Date.parse(active.started_at)
          return Number.isFinite(t) ? t : Date.now()
        })()
        const baseline = {
          with: Number(status0?.with_visuals ?? status0?.count ?? 0),
          total: Number(status0?.total ?? 0),
        }
        set({
          generatingMonth: true,
          generationStartedAt: startedAtMs,
          generationPollCount: 0,
          generationProgress: baseline.total > 0 ? baseline : null,
          generationFailure: null,
        })
        ;(async () => {
          try {
            await get()._pollForContent(brandId, month, year, baseline)
            set({ generationFailure: null })
          } catch (err) {
            const detail = err?.response?.data?.detail
            const reason =
              (typeof detail === 'string' && detail.trim()) ||
              (detail && typeof detail === 'object' && (detail.message || detail.code)) ||
              err?.message ||
              'Generation failed. Please try again.'
            set({
              generationFailure: { reason: String(reason).slice(0, 400), month, year },
            })
          } finally {
            set({ generatingMonth: false, generationStartedAt: null, generationProgress: null })
          }
        })()
        return true
      },

      // Surface a backend-recorded OpenAI capacity failure on the
      // GenerationStatusBanner. /content/status returns
      // `last_generation_failure: { code, message, occurred_at, month, year }`
      // when the most recent run for this brand+month hit a 429 / billing /
      // outage condition. We treat it as a one-shot dismissable failure
      // identical to a live generation error so the same Retry CTA works.
      checkLastGenerationFailure: async (month, year) => {
        const brandId = get().activeBrandId
        if (!brandId || !month || !year) return false
        if (get().generatingMonth) return false
        if (get().generationFailure) return false
        let status
        try {
          status = await contentApi.getStatus(brandId, year, month)
        } catch {
          return false
        }
        const failure = status?.last_generation_failure
        if (!failure || !failure.code) return false
        if (Number(failure.month) !== Number(month) || Number(failure.year) !== Number(year)) {
          return false
        }
        set({
          generationFailure: {
            code: String(failure.code),
            reason: String(failure.message || 'ChatGPT had a problem during your last generation. Try again.').slice(0, 400),
            month,
            year,
          },
        })
        return true
      },

      // Poll with exponential backoff. Returns number of posts found.
      //
      // Incremental: every time the server reports more visuals than we saw
      // last poll, we re-fetch the month so newly-ready posts appear in the
      // calendar grid + on the dashboard's "today" card without waiting for
      // the whole batch to finish. The user sees their feed fill up live.
      //
      // `baseline` is the (with_visuals, total) snapshot taken just BEFORE
      // the generation kickoff. The "ready" exit only fires when the new
      // run has actually grown the count past this baseline, so a stale
      // /content/status that still reports the previous batch's 7/7 can't
      // dismiss the loader the moment polling starts.
      _pollForContent: async (brandId, month, year, baseline = { with: 0, total: 0 }) => {
        const maxAttempts = 36
        const delays = [3000, 3000, 4000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]
        let lastWithV = -1
        const baselineWith = Number(baseline?.with || 0)
        // Show the baseline immediately so the progress label doesn't read
        // "0 of 0" before the first poll lands. The loop will overwrite it
        // as soon as it gets a real status response.
        if (baselineWith > 0) {
          set({ generationProgress: { with: baselineWith, total: Number(baseline?.total || baselineWith) } })
        }

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
            // Don't trust "ready" until the count has actually GROWN past
            // the baseline. A backend that hasn't yet picked up the new
            // run will still report the previous batch as ready — exiting
            // here would dismiss the loader without anything new being
            // created. Wait until either the count grew, or the backend
            // reports a strictly larger total (new posts queued).
            const grewPastBaseline = withV > baselineWith || total > Number(baseline?.total || 0)
            if (status.ready && withV > 0 && grewPastBaseline) {
              const items = await get().fetchMonthContent(month, year)
              return items.length
            }
          } catch (e) {
            if (e.message && !e.message.includes('fetch') && !e.message.includes('Network')) throw e
            const items = await get().fetchMonthContent(month, year)
            if (items.length > baselineWith) return items.length
          }
        }
        const items = await get().fetchMonthContent(month, year)
        // Only the count matters for the "taking too long" message — if the
        // batch hasn't grown the catalogue past the baseline we know the
        // run hasn't actually delivered yet, even if the previous batch
        // still has posts in it. Treat both "no posts at all" and "no
        // growth past baseline" as a timeout so the user gets the
        // friendly message + the failure banner with a Retry button.
        if (items.length === 0 || items.length <= baselineWith) {
          throw new Error(
            'Generation is taking longer than expected. Finished posts will appear on the calendar automatically; check back in a minute.'
          )
        }
        return items.length
      },

      fetchMonthContent: async (month, year) => {
        const brandId = get().activeBrandId
        if (!brandId) return []
        // include_failed=true so the calendar can render FAILED posts as
        // "Generation failed — Regenerate" tiles. Without this the user
        // generates 4, only sees 2, and has no signal that the other 2
        // exist or how to recover them.
        const items = (await contentApi.list({ brand_id: brandId, month, year, include_failed: true })).map(normalizeContentItem)
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
