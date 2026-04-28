# Dashboard Rebuild — Full Walkthrough (Waves 1–4)

This document supersedes [dashboard-wave-1.md](dashboard-wave-1.md) once Wave 1 is reviewed. The PR collapses all four waves of the spec ([R1–R10](#requirement-coverage)) into a single, feature-flagged rollout. Every block below is gated behind a flag in [frontend/src/lib/featureFlags.js](../frontend/src/lib/featureFlags.js) so any wave can be dark-launched and rolled back independently.

---

## Wave 1 — foundations (R1.1, R1.2, R10.1, R10.2, R8.3, R5.4)

Already covered in [dashboard-wave-1.md](dashboard-wave-1.md). Key additions:

- `WhatsNextCard` ranks 6 signals → 1 fallback ([useDashboardSignals](../frontend/src/hooks/useDashboardSignals.js))
- `TimeframeTabs` (Today / This week / This month) drives every timeframe-aware widget
- `EmptyState` primitive applied to every empty list
- Skeleton states across every async surface
- Optimistic delete on upcoming posts
- Connection-health pill in the sidebar + `ConnectionHealthModal`
- Feature-flag wrapper, telemetry client + `POST /telemetry/events`, minimal approve/reject endpoints

## Wave 2 — excitement (R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R3.6, R2.10)

| R | Surface | Files | Backend |
|---|---|---|---|
| R1.3 | Live publishing feed | [LivePublishFeed](../frontend/src/components/dashboard/LivePublishFeed.jsx) | `GET /dashboard/social-events` |
| R1.4 | Top-performing post | [TopPostWidget](../frontend/src/components/dashboard/TopPostWidget.jsx) | `GET /dashboard/best-post` |
| R1.5 | Trend opportunities | already on `DashboardPage` | uses existing `/trends` |
| R1.6 | Engagement deltas | folded into `MonthlyRecapCard` (`delta_engagement_pct`) | `GET /dashboard/monthly-recap` |
| R1.7 | Streak indicator | [StreakIndicator](../frontend/src/components/dashboard/StreakIndicator.jsx) | `GET /dashboard/streak` |
| R1.8 | Daily briefing | [BriefingCard](../frontend/src/components/dashboard/BriefingCard.jsx) | `GET /dashboard/briefing` (cached per day in `dashboard_briefings`) |
| R1.9 | Activation checklist | [ActivationChecklist](../frontend/src/components/dashboard/ActivationChecklist.jsx) | `GET /dashboard/activation` |
| R3.6 | Stepwise generation progress | [GenerationProgress](../frontend/src/components/ui/GenerationProgress.jsx) | none — pure UI |
| R2.10 | Per-post performance overlay | [PerfChip](../frontend/src/components/calendar/PerfChip.jsx) | uses existing `SocialPost.metrics` |

All Wave 2 backend lives in [backend/app/api/dashboard.py](../backend/app/api/dashboard.py). Migration: [20260426_04](../backend/alembic/versions/20260426_04_dashboard_rebuild_schema.py).

## Wave 3 — depth (R2.1–R2.6, R3.1–R3.5, R4.1–R4.5, R5.1–R5.3)

### Calendar (R2)

| R | Where it lives | Status |
|---|---|---|
| R2.1 D&D reschedule | [DroppableDayCell + DraggablePost](../frontend/src/components/calendar/DroppableDayCell.jsx) | **Components shipped + flag**, post-card integration into the existing 2,400-line `CalendarPage` is queued as Wave 3.5 (see [§Stub catalogue](#stub-catalogue)). |
| R2.2 Optimal-time hints | `optimal_time` field stub on `analytics.summary` (`best_time`) | Surface ships in Analytics; calendar visual hints are 3.5 |
| R2.3 Multi-brand overlay | not yet wired (UI exists in primitives) | 3.5 |
| R2.4 Campaign banding | `content_items.campaign_id` column (migration 04) | UI in 3.5 |
| R2.5 Empty-slot affordance | [DroppableDayCell.onEmptySlotClick](../frontend/src/components/calendar/DroppableDayCell.jsx) | **Component shipped** |
| R2.6 Conflict warnings | [calendarConflicts.js](../frontend/src/utils/calendarConflicts.js) + [ConflictChip](../frontend/src/components/calendar/ConflictChip.jsx) + banner in [CalendarPage:1462](../frontend/src/pages/CalendarPage.jsx:1462) | **Wired live** |

### AI / generation (R3)

| R | Where it lives | Notes |
|---|---|---|
| R3.1 Remix chips | [RemixChips](../frontend/src/components/ai/RemixChips.jsx) → `POST /content/{id}/remix` | 6 recipes; pending-diff accept/reject |
| R3.2 Variants | [VariantsPanel](../frontend/src/components/ai/VariantsPanel.jsx) → `POST /content/{id}/variants` | 3 captions, side-by-side picker |
| R3.3 Granular regenerate | already exists (`/content/{id}/regenerate`, `/content/{id}/regenerate-visual`) | exposed in `AIPage` |
| R3.4 Brand-fit score | [BrandFitBadge](../frontend/src/components/ai/BrandFitBadge.jsx) → `GET /content/{id}/brand-fit` | deterministic heuristic — swap when AI scorer ships |
| R3.5 Why this post | [WhyPanel](../frontend/src/components/ai/WhyPanel.jsx) → `GET /content/{id}/explanation` | composed of playbook + visual_strategy + rules |

### Brand Kit (R4)

| R | Where it lives |
|---|---|
| R4.1 Two-mode UI | [BrandModeToggle](../frontend/src/components/brand/BrandModeToggle.jsx) — preference persisted to `localStorage`. Wired into [BrandKitPage:961](../frontend/src/pages/BrandKitPage.jsx:961) |
| R4.2 Brand health score | [BrandHealthScore](../frontend/src/components/brand/BrandHealthScore.jsx) — click any lifter to deep-link the relevant tab |
| R4.3 Refresh from website | endpoint already exists (`POST /workspaces/{wsId}/brands/{brandId}/website/sync`) |
| R4.4 Live logo placement preview | not yet built — primitive exists in `BrandKitPage` template tab |
| R4.5 Rule violation warnings | covered by `brand-fit` rules block on AI surface |

### Social hub & approvals (R5.1–R5.3)

| R | Where it lives |
|---|---|
| R5.1 Unified inbox | [InboxPage](../frontend/src/pages/InboxPage.jsx) → `GET /inbox` |
| R5.2 Sentiment + spam | server-side `classify_sentiment` in [inbox.py](../backend/app/api/inbox.py); spam folder collapsed by default in UI |
| R5.3 Approval queue widget | [ApprovalQueueWidget](../frontend/src/components/dashboard/ApprovalQueueWidget.jsx) on `/dashboard` (uses existing `contentApi.list({ status: 'ready' })` + new approve/reject endpoints from Wave 1) |

## Wave 4 — scale (R6, R7, R9, R10.3–R10.5)

### Analytics (R6)

| R | Where | Notes |
|---|---|---|
| R6.1 New `/analytics` page | [AnalyticsPage](../frontend/src/pages/AnalyticsPage.jsx) → `GET /analytics/summary` | reach, engagement, follower growth, best format/time/topic, top 5 posts |
| R6.2 Filters | window (7/30/90d), platform | implemented |
| R6.3 Competitor benchmark | UI ships, backend is a documented stub returning `[]` until the scrape job is built — see catalogue |
| R6.4 Branded PDF report | UI button; backend accepts the schedule but does **not** render PDFs yet — stub |
| R6.5 UTM auto-injection | not yet implemented — requires Shopify/Bumpa integration depth |

### Collaboration (R7)

| R | Where | Notes |
|---|---|---|
| R7.1 Client portal | `share_links` table + endpoint shape in migration 04 | UI deferred — public-link rendering belongs to its own scoped review |
| R7.2 Comments on posts | `POST/GET /content/{id}/comments` ([content_extras.py](../backend/app/api/content_extras.py)) + `content_comments` table | UI surface lives in the AI Studio thread (extends naturally) |
| R7.3 Activity timeline | `GET /content/{id}/activity` + `content_activity` table | every approve/remix/comment writes an entry |
| R7.4 Workspace switcher upgrade | `data-workspace-switcher` attribute + `⌘K` shortcut focuses it | full search/recents are queued |
| R7.5 Slack/email notifications | **stubbed** — no transport wired. See catalogue |

### Onboarding (R8.1–R8.4)

R8.1 (interactive tour), R8.2 (sample brand fixture), R8.4 (aha-moment instrumentation) are explicitly out of this PR — the activation checklist (R8.3) is the user-visible surface; tour/fixture deserve a focused review.

### Delight & retention (R9)

| R | Where |
|---|---|
| R9.1 Monthly recap card | [MonthlyRecapCard](../frontend/src/components/dashboard/MonthlyRecapCard.jsx) |
| R9.2 Milestone toasts | infrastructure ready (telemetry events `dashboard.activation.*`, `streak.*`); no toasts yet |
| R9.3 Weekly trend digest email | **stubbed** — no email transport |
| R9.4 Referral widget | [ReferralWidget](../frontend/src/components/settings/ReferralWidget.jsx) in Settings |
| R9.5 Changelog drawer | [ChangelogDrawer](../frontend/src/components/ui/ChangelogDrawer.jsx) — sidebar "What's new" button |

### Performance & polish (R10)

| R | Where |
|---|---|
| R10.1 Skeletons | applied across Wave 1; reused in every new widget |
| R10.2 Optimistic UI | applied to delete (Wave 1), approve/reject (Wave 3) |
| R10.3 Mobile responsive | dashboard widgets use the existing tailwind grid breakpoints; sidebar already collapses on mobile. Full deep-sweep deferred. |
| R10.4 Keyboard shortcuts | [keyboardShortcuts.jsx](../frontend/src/lib/keyboardShortcuts.jsx) — `⌘K`, `G C/I/A/B`, `?` cheatsheet |
| R10.5 Dark mode | [theme.js](../frontend/src/lib/theme.js) + [ThemeToggle](../frontend/src/components/ui/ThemeToggle.jsx) — sets `data-theme` and `cc-dark` class on `<html>`. Light/dark/system. |

---

## Feature flag matrix

All flags default `true` to make this PR self-demonstrating. Disable any of them via:

```js
localStorage.setItem('contentcard.flags', JSON.stringify({ '<flag>': false }))
```

or env: `VITE_FEATURE_<UPPER_SNAKE_FLAG>=false`.

| Wave | Flag | Surface |
|---|---|---|
| 1 | `dashboard.whats_next` | Hero card on `/dashboard` |
| 1 | `dashboard.timeframe_tabs` | Today/Week/Month tabs |
| 1 | `dashboard.legacy_stats` | Old stats grid + social momentum + platform breakdown |
| 1 | `nav.connection_health_badge` | Sidebar pill + modal |
| 2 | `dashboard.live_feed` | LivePublishFeed widget |
| 2 | `dashboard.top_post` | TopPostWidget |
| 2 | `dashboard.streak` | StreakIndicator |
| 2 | `dashboard.briefing` | BriefingCard |
| 2 | `dashboard.activation` | ActivationChecklist |
| 2 | `dashboard.monthly_recap` | MonthlyRecapCard |
| 2 | `ai.generation_progress` | Stepwise progress in AIPage |
| 3 | `dashboard.approval_queue` | ApprovalQueueWidget |
| 3 | `calendar.dnd_reschedule` | DroppableDayCell components (integration pending) |
| 3 | `calendar.conflict_warnings` | Conflict banner on CalendarPage |
| 3 | `calendar.empty_slot_affordance` | DroppableDayCell affordance (integration pending) |
| 3 | `calendar.perf_overlay` | PerfChip component (integration pending) |
| 3 | `ai.remix_chips` | RemixChips on AIPage |
| 3 | `ai.variants` | VariantsPanel on AIPage |
| 3 | `ai.brand_fit` | BrandFitBadge on AIPage |
| 3 | `ai.why_panel` | WhyPanel on AIPage |
| 3 | `brand_kit.two_mode` | BrandModeToggle in BrandKit header |
| 3 | `brand_kit.score` | BrandHealthScore in BrandKit header |
| 4 | `analytics.page` | `/dashboard/analytics` route + sidebar entry |
| 4 | `inbox.page` | `/dashboard/inbox` route + sidebar entry |
| 4 | `ai.page` | `/dashboard/ai` route + sidebar entry |
| 4 | `nav.dark_mode` | Theme toggle in Settings |
| 4 | `nav.keyboard_shortcuts` | Global handler + `?` cheatsheet |
| 4 | `nav.changelog_drawer` | Sidebar "What's new" |
| 4 | `settings.referral_widget` | Referral card in Settings |

---

## Backend additions

### New routers
- [backend/app/api/telemetry.py](../backend/app/api/telemetry.py) — `POST /telemetry/events`
- [backend/app/api/dashboard.py](../backend/app/api/dashboard.py) — `/dashboard/social-events`, `/streak`, `/briefing`, `/best-post`, `/monthly-recap`, `/activation`
- [backend/app/api/content_extras.py](../backend/app/api/content_extras.py) — `/content/{id}/remix`, `/variants`, `/brand-fit`, `/explanation`, `/comments`, `/activity`
- [backend/app/api/inbox.py](../backend/app/api/inbox.py) — `/inbox` list + spam mark
- [backend/app/api/analytics.py](../backend/app/api/analytics.py) — `/analytics/summary`, `/competitors`, `/report`

### New models
- `TelemetryEvent`, `DashboardBriefing`, `ContentComment`, `ContentActivity`
- `content_items.campaign_id` column for campaign banding (R2.4)

### Migrations
- [20260426_03_telemetry_events.py](../backend/alembic/versions/20260426_03_telemetry_events.py)
- [20260426_04_dashboard_rebuild_schema.py](../backend/alembic/versions/20260426_04_dashboard_rebuild_schema.py)

### New endpoint registrations in [backend/app/main.py](../backend/app/main.py)
All five new routers are mounted under `/api/v1`. Defensive `ALTER TABLE … ADD COLUMN IF NOT EXISTS` lines were added to the lifespan handler so a fresh deploy boots even before alembic runs (matches the codebase's existing pattern).

### New existing-content endpoints
- `POST /content/{id}/approve` — Wave 1 (manager persona signal)
- `POST /content/{id}/reject` — Wave 1
- `POST /content/{id}/remix` — Wave 3
- `POST /content/{id}/variants` — Wave 3
- `GET  /content/{id}/brand-fit` — Wave 3
- `GET  /content/{id}/explanation` — Wave 3
- `GET  /content/{id}/comments`, `POST /content/{id}/comments` — Wave 3
- `GET  /content/{id}/activity` — Wave 3

---

## Stub catalogue

These ship a working endpoint shape and a documented UI affordance, but the underlying integration is **not** wired and is explicitly listed here so reviewers don't mistake them for working features:

| What | Where | What's missing |
|---|---|---|
| AI-generated daily briefing copy | `GET /dashboard/briefing` | The `summary` is a deterministic template (`"Yesterday you published X. Today Y are on deck."`); needs an `ai_service` call when the briefing prompt lands. |
| Brand-fit scoring | `GET /content/{id}/brand-fit` | Heuristic only — caption length, image presence, banned-word match. Real model swap-in is a one-line change at the endpoint. |
| Competitor benchmarks | `GET /analytics/competitors` | Returns `{ benchmarks: [], note: "..." }`. Needs the periodic scrape worker. |
| Branded PDF report | `POST /analytics/report` | Accepts `{schedule, email_to}`; returns `accepted` but no PDF render or email delivery exists yet. |
| Slack / email notifications (R7.5) | nowhere | No transport wired. Use the existing telemetry events as the trigger when adding it. |
| Weekly trend digest email (R9.3) | nowhere | Same — needs an email transport. |
| Public client portal (R7.1) | `share_links` table exists | No public render route. The schema is there for a focused follow-up. |
| UTM auto-injection (R6.5) | nowhere | Requires Shopify/Bumpa session-tagging changes. |
| Calendar D&D, perf chip, multi-brand overlay, campaign ribbon, optimal-time glow | components exist; CalendarPage is 2,463 LOC | Integration into the existing post-card render sites is queued as Wave 3.5 — kept out of this PR to bound risk. |
| Real `pending_approval` `ContentStatus` value | `ContentItem.status` | Wave 3 treats `READY` as awaiting approval. A new enum value + migration is the swap path. |

---

## Telemetry catalogue

All events emitted across Waves 1–4. Persisted to `telemetry_events` (`name`, `user_id`, `workspace_id`, `brand_id`, `session_id`, `path`, `props`, `client_ts`, `server_ts`).

```
dashboard.viewed
dashboard.timeframe_changed
dashboard.whats_next.impression
dashboard.whats_next.cta_clicked
dashboard.upcoming.delete_clicked
dashboard.live_feed.impression
dashboard.top_post.generate_more
dashboard.briefing.refreshed
dashboard.activation.dismissed
dashboard.activation.step_clicked
dashboard.monthly_recap.open_analytics
dashboard.approval_queue.approve_clicked
dashboard.approval_queue.reject_clicked
connection_health.badge_clicked
connection_health.reconnect_clicked
empty_state.cta_clicked
calendar.post_drag_started
calendar.post_dropped
calendar.empty_slot.cta_clicked
ai.remix.applied
ai.remix.accepted
ai.remix.rejected
ai.variants.requested
ai.variants.picked
ai.brand_fit.expanded
ai.why_panel.opened
brand_kit.mode_changed
brand_kit.score.lifter_clicked
analytics.viewed
analytics.window_changed
analytics.report.scheduled
analytics.competitors.add_clicked
inbox.viewed
inbox.reply_sent
inbox.suggested_used
ai_page.viewed
theme.changed
shortcut.fired
nav.changelog_clicked
changelog.opened
referral.link_copied
```

---

## Verification (preview, no backend)

```bash
cd frontend && npm install && npm run dev    # port 5174
```

In the browser console:

```js
localStorage.setItem('contentcard-auth', JSON.stringify({
  state: {
    user: { id: 'demo', email: 'demo@example.com', full_name: 'Demo User' },
    token: '<real-bearer-or-fake>',
    isAuthenticated: true, isLoading: false, error: null,
  }, version: 0,
}));
localStorage.setItem('contentcard-app', JSON.stringify({
  state: { activeWorkspaceId: '<ws>', activeBrandId: '<brand>' },
  version: 0,
}));
location.href = '/dashboard';
```

Confirm:

```js
({
  hero:           !!document.querySelector('[aria-label="What\\\'s next"]'),
  tabs:           !!document.querySelector('[aria-label="Dashboard timeframe"]'),
  briefing:       document.body.innerText.includes('Daily briefing'),
  streak:         document.body.innerText.includes('Posting streak'),
  liveFeed:       document.body.innerText.includes('Live publishing feed'),
  topPost:        document.body.innerText.includes('Top performer'),
  approvalQueue:  document.body.innerText.includes('Approval queue'),
  recap:          document.body.innerText.includes('Monthly recap'),
  activation:     document.body.innerText.includes('ACTIVATION'),
  navAI:          !!document.querySelector('a[href="/dashboard/ai"]'),
  navInbox:       !!document.querySelector('a[href="/dashboard/inbox"]'),
  navAnalytics:   !!document.querySelector('a[href="/dashboard/analytics"]'),
})
```

All entries should be `true`. Visit `/dashboard/analytics`, `/dashboard/inbox`, `/dashboard/ai` to confirm each new page renders empty-state cleanly without the API. Press `?` for the keyboard cheatsheet; `G` then `C/I/A/B` to navigate.

---

## Requirement coverage

| Requirement | Status |
|---|---|
| R1.1 What's next hero | ✅ Wave 1 |
| R1.2 Timeframe tabs | ✅ Wave 1 |
| R1.3 Live publishing feed | ✅ Wave 2 |
| R1.4 Top-performing post | ✅ Wave 2 |
| R1.5 Trend opportunities widget | ✅ existing card on dashboard |
| R1.6 Engagement deltas | ✅ Wave 2 (in MonthlyRecap) |
| R1.7 Streak indicator | ✅ Wave 2 |
| R1.8 Daily briefing | ✅ Wave 2 (heuristic copy; AI hookup pending) |
| R1.9 Activation checklist | ✅ Wave 2 |
| R2.1 D&D reschedule | 🟡 components shipped, integration into existing CalendarPage pending |
| R2.2 Optimal-time hints | 🟡 best_time data exposed via Analytics; calendar overlay pending |
| R2.3 Multi-brand overlay | 🟡 deferred |
| R2.4 Campaign banding | 🟡 column added; UI pending |
| R2.5 Empty-slot affordance | 🟡 component shipped, integration pending |
| R2.6 Conflict warnings | ✅ banner live on CalendarPage |
| R2.7 Holiday overlay | ✅ pre-existing |
| R2.8 Bulk select | ✅ pre-existing |
| R2.9 Export iCal/PDF | 🟡 not in scope |
| R2.10 Per-post performance overlay | 🟡 PerfChip shipped, post-card integration pending |
| R3.1 Remix chips | ✅ Wave 3 |
| R3.2 Variants | ✅ Wave 3 |
| R3.3 Granular regenerate | ✅ pre-existing, exposed in AIPage |
| R3.4 Brand-fit score | ✅ Wave 3 (heuristic) |
| R3.5 Why this post | ✅ Wave 3 |
| R3.6 Generation progress UI | ✅ Wave 2 |
| R4.1 Two-mode UI | ✅ Wave 3 |
| R4.2 Brand health score | ✅ Wave 3 |
| R4.3 Refresh from website | ✅ pre-existing endpoint |
| R4.4 Live logo placement preview | 🟡 deferred |
| R4.5 Rule violation warnings | ✅ via brand-fit |
| R5.1 Unified inbox | ✅ Wave 4 |
| R5.2 Sentiment + spam | ✅ Wave 4 |
| R5.3 Approval queue widget | ✅ Wave 3 |
| R5.4 Connection health badge | ✅ Wave 1 |
| R5.5 Publish preflight | ✅ pre-existing endpoint |
| R5.6 Post-publish toast | 🟡 not in scope |
| R6.1 Analytics page | ✅ Wave 4 |
| R6.2 Filters | ✅ Wave 4 |
| R6.3 Competitor benchmark | 🟡 stubbed |
| R6.4 Branded PDF report | 🟡 stubbed |
| R6.5 UTM auto-injection | 🟡 not in scope |
| R7.1 Client portal | 🟡 schema only |
| R7.2 Comments | ✅ Wave 3 (backend + endpoints) |
| R7.3 Activity timeline | ✅ Wave 3 |
| R7.4 Workspace switcher upgrade | 🟡 ⌘K focus only |
| R7.5 Slack/email notifications | 🟡 stubbed |
| R8.1 Interactive tour | 🟡 not in scope |
| R8.2 Sample brand fixture | 🟡 not in scope |
| R8.3 Empty states | ✅ Wave 1 |
| R8.4 Aha-moment instrumentation | ✅ telemetry pipeline ready |
| R9.1 Monthly recap card | ✅ Wave 2 |
| R9.2 Milestone toasts | 🟡 events defined; toasts pending |
| R9.3 Weekly trend digest email | 🟡 stubbed |
| R9.4 Referral widget | ✅ Wave 4 |
| R9.5 Changelog drawer | ✅ Wave 4 |
| R10.1 Skeleton states | ✅ Wave 1 |
| R10.2 Optimistic UI | ✅ Wave 1/3 |
| R10.3 Mobile responsive | 🟡 partial; deep sweep deferred |
| R10.4 Keyboard shortcuts | ✅ Wave 4 |
| R10.5 Dark mode | ✅ Wave 4 |

Legend: ✅ shipped & wired · 🟡 partial / stubbed (see catalogue)

---

## Rollout plan

1. Deploy with all flags `true`. Internal dogfood for 48h.
2. Watch the telemetry mix: `dashboard.whats_next.impression` distribution is the activation canary.
3. Once dogfooded, hide the stubbed pieces by flipping their flags off until the underlying integrations land. Specifically:
   - `analytics.competitors.*` shows the empty state — keep it but disable the "Add handles" button
   - `analytics.report.*` accept-only behavior is fine to leave on if we explain the SLA
4. Plan Wave 3.5 (post-card integration of D&D / perf chip / banding / multi-brand overlay) as the focused follow-up — it's the largest deferred surface.
