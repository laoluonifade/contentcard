# Dashboard Rebuild — Wave 1 Walkthrough

Wave 1 delivers the foundations the rest of the rebuild plugs into:
**What's next hero card (R1.1)**, **timeframe tabs (R1.2)**, **skeleton states everywhere (R10.1)**, **optimistic UI on delete (R10.2)**, **empty states with CTAs (R8.3)**, and the **connection health badge in nav (R5.4)**. It also lands the cross-cutting plumbing every later wave needs: a feature flag wrapper, a client telemetry pipeline, and minimal `approve`/`reject` endpoints so the manager-persona signal is real, not a stub.

## Surfaces touched

| File | What changed |
|---|---|
| [frontend/src/pages/DashboardPage.jsx](../frontend/src/pages/DashboardPage.jsx) | New WhatsNext hero, timeframe tabs, skeleton states across every widget, optimistic delete on upcoming posts, empty states with CTAs, signal action router |
| [frontend/src/components/layout/DashboardLayout.jsx](../frontend/src/components/layout/DashboardLayout.jsx) | Connection health badge polls `/social/connections/health` every 60s; opens the new `ConnectionHealthModal` on click or via `contentcard:open-connection-health` event |
| [frontend/src/api/index.js](../frontend/src/api/index.js) | Added `contentApi.approve`, `contentApi.reject`, `telemetryApi.recordEvents` |
| [backend/app/api/content.py](../backend/app/api/content.py) | New `POST /content/{id}/approve` and `POST /content/{id}/reject` |
| [backend/app/api/telemetry.py](../backend/app/api/telemetry.py) | New router: `POST /telemetry/events` (best-effort, never raises) |
| [backend/app/core/dependencies.py](../backend/app/core/dependencies.py) | Added `get_current_user_optional` for best-effort endpoints |
| [backend/app/main.py](../backend/app/main.py) | Wires telemetry router; imports `app.api.telemetry` so the new model registers on `Base.metadata` |
| [backend/alembic/versions/20260426_03_telemetry_events.py](../backend/alembic/versions/20260426_03_telemetry_events.py) | Creates `telemetry_events` table with indexes on name/user_id/workspace_id/server_ts |

## New components

| Path | Purpose |
|---|---|
| [frontend/src/lib/featureFlags.js](../frontend/src/lib/featureFlags.js) | `useFeatureFlag(name)`, `setFeatureFlag`, `<FeatureFlag>`. Resolution order: `localStorage('contentcard.flags')` → `import.meta.env.VITE_FEATURE_*` → `DEFAULTS` |
| [frontend/src/lib/telemetry.js](../frontend/src/lib/telemetry.js) | `track(name, props)` and `useImpression(name, props)`. Buffers + flushes every 5s or on 50 events; `sendBeacon` on unload |
| [frontend/src/components/ui/EmptyState.jsx](../frontend/src/components/ui/EmptyState.jsx) | Shared empty-state shell (icon + title + body + CTA). CTA click auto-instrumented |
| [frontend/src/components/dashboard/TimeframeTabs.jsx](../frontend/src/components/dashboard/TimeframeTabs.jsx) | Today / This week / This month tab strip, fires `dashboard.timeframe_changed`. Exports `timeframeWindow(timeframe)` for callers |
| [frontend/src/components/dashboard/WhatsNextCard.jsx](../frontend/src/components/dashboard/WhatsNextCard.jsx) | Renders one ranked signal as title + body + primary CTA. Fires `dashboard.whats_next.impression` and `dashboard.whats_next.cta_clicked` |
| [frontend/src/hooks/useDashboardSignals.js](../frontend/src/hooks/useDashboardSignals.js) | Fetches connection health, pending approvals, recent failures, trends, calendar slots, brand-kit completeness in parallel and returns the highest-priority signal |
| [frontend/src/components/social/ConnectionHealthModal.jsx](../frontend/src/components/social/ConnectionHealthModal.jsx) | Lists broken / expiring / healthy connections; "Reconnect" kicks off the existing OAuth start flow per platform |

## Feature flags introduced

All four default to `true` in code, but every R-block is gated so we can dark-launch.

- `dashboard.whats_next` (R1.1)
- `dashboard.timeframe_tabs` (R1.2)
- `dashboard.legacy_stats` — gates the existing stat grid + social momentum + platform breakdown so we can phase them out as later waves replace them
- `nav.connection_health_badge` (R5.4)

Override locally via `localStorage.contentcard.flags = '{"dashboard.whats_next":false}'` or env: `VITE_FEATURE_DASHBOARD_WHATS_NEXT=false`.

## Telemetry events emitted in Wave 1

| Event | Where |
|---|---|
| `dashboard.viewed` | `DashboardPage` mount |
| `dashboard.timeframe_changed` | `TimeframeTabs.onChange` |
| `dashboard.whats_next.impression` | `WhatsNextCard` mount, per signal kind |
| `dashboard.whats_next.cta_clicked` | hero card primary CTA |
| `dashboard.upcoming.delete_clicked` | optimistic delete on upcoming list |
| `connection_health.badge_clicked` | sidebar pill |
| `connection_health.reconnect_clicked` | per-platform reconnect button |
| `empty_state.cta_clicked` | every `<EmptyState>` CTA |

Schema persisted: `id`, `name`, `user_id`, `workspace_id`, `brand_id`, `session_id`, `path`, `props (JSON)`, `client_ts`, `server_ts`.

## Hero card ranking (`useDashboardSignals`)

In priority order — first match wins:

1. **`connection_broken`** — any platform with `needs_reconnect` or `expires_in_hours <= 72`. Tone: urgent. CTA opens the connection health modal via a custom event the layout listens for.
2. **`awaiting_approval`** — content items with `status='ready'` (legacy schema interpretation; spec's `pending_approval` doesn't exist as an enum value yet). Manager persona.
3. **`publish_failed`** — `social/posts?status=failed` with `failed_at` inside the last 24h.
4. **`trend_opportunity`** — top trend matched to the workspace's industry.
5. **`empty_slot`** — no scheduled post for today or tomorrow.
6. **`brand_kit_incomplete`** — `< 60%` of required brand-readiness fields filled.
7. **`all_clear`** — fallback so the card always renders. CTA: "Plan ahead".

Each kind has its own icon (lucide), tone (urgent / attention / opportunity / neutral) and CTA wired through `handleSignalAction(signal)` in `DashboardPage`.

## What Wave 1 does *not* do (deferred per sequencing)

- Live publishing feed (R1.3 — Wave 2)
- Top-performing post widget (R1.4 — Wave 2)
- Trend opportunities widget on home (R1.5 — Wave 2)
- Engagement deltas vs prior period (R1.6 — Wave 2)
- Streak indicator (R1.7 — Wave 2)
- Daily briefing card (R1.8 — Wave 2)
- Activation checklist (R1.9 — Wave 2)
- Calendar D&D, optimal-time hints, multi-brand overlay, conflict warnings, holiday overlay, bulk select, exports (R2 — Wave 3)
- Remix chips, variant generation, brand-fit score, generation progress UI (R3 — Wave 3)
- Brand Kit two-mode UI, refresh-from-website, logo placement preview (R4 — Wave 3)
- Inbox, sentiment classification, approval queue UI (R5.1–R5.3 — Wave 3)
- Analytics page, competitor benchmark, branded PDF export, UTM injection (R6 — Wave 4)
- Client portal, comment threads, activity timeline, workspace switcher upgrade, Slack/email notifications (R7 — Wave 4)
- Onboarding tour, sample brand fixture (R8.1, R8.2 — Wave 4)
- Monthly recap, milestone toasts, weekly trend digest, referral, changelog (R9 — Wave 4)
- Mobile-responsive deep sweep, keyboard shortcuts, dark mode (R10.3–R10.5 — Wave 4)

## Open follow-ups for Wave 2 review

- **Brand-kit score backend.** The `brand-kit-scoring` branch hasn't merged. The hero card uses a frontend-only ratio over `getMissingFields(brand)` until that lands, then we swap.
- **Approvals roles.** The new endpoints check editor access. R5 will need to enforce `WorkspaceRole.APPROVER` separately and surface a real `pending_approval` enum value (currently we treat `READY` as awaiting approval).
- **Telemetry observability.** `telemetry_events` is write-only today. An admin viewer + retention policy belongs in Wave 4 alongside the analytics page.
- **Server-driven flags.** `localStorage` + env is intentionally minimal; once we have a flag service, swap `featureFlags.js` to read from it without touching call sites.

## Verification

Reproduced locally with `npm run dev` and the dev preview tooling. Steps:

1. From the worktree, `cd frontend && npm install && npm run dev` (port 5174).
2. Seed an authenticated session in the browser console:

   ```js
   localStorage.setItem('contentcard-auth', JSON.stringify({
     state: {
       user: { id: 'demo', email: 'demo@example.com', full_name: 'Demo User' },
       token: '<valid-token-or-real-bearer>', isAuthenticated: true,
       isLoading: false, error: null,
     }, version: 0,
   }));
   localStorage.setItem('contentcard-app', JSON.stringify({
     state: { activeWorkspaceId: '<ws-id>', activeBrandId: '<brand-id>' },
     version: 0,
   }));
   location.href = '/dashboard';
   ```

3. Confirm the rendered tree:

   ```js
   ({
     hero:    !!document.querySelector('[aria-label="What\\\'s next"]'),
     tabs:    !!document.querySelector('[aria-label="Dashboard timeframe"]'),
     legacy:  !!document.querySelector('h3') && [...document.querySelectorAll('h3')].some(h => /Social momentum/.test(h.textContent)),
   })
   // → { hero: true, tabs: true, legacy: true }
   ```

4. Click a timeframe tab — the upcoming-posts panel header re-titles between `Today's posts` / `This week` / `This month`.
5. Open the connection health modal:

   ```js
   window.dispatchEvent(new CustomEvent('contentcard:open-connection-health'));
   document.querySelector('[role="dialog"][aria-label="Connection health"]')
   // → element (not null)
   ```

6. Confirm the telemetry pipeline by inspecting `await fetch('/api/v1/telemetry/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <token>' }, body: '{"events":[{"name":"manual.test","ts":"2026-04-26T12:00:00Z"}]}' })` — server returns `{ accepted: 1 }`.

The hero card shows whichever signal is highest-priority for the seeded brand. Without API access (e.g. backend down), the hook falls through to the `all_clear` / `empty_slot` signal so the surface is never blank.

## DB migration

Run `alembic upgrade head` to pick up `20260426_03_telemetry_events`. The lifespan handler in `main.py` already calls `Base.metadata.create_all`, which creates the table when the migration hasn't run yet (e.g. local dev), so the API works immediately on a fresh DB.

## Rollout

1. Deploy with all four flags defaulting `true`.
2. Internal dogfood for 48h. Watch `dashboard.whats_next.impression` event mix; the urgent/attention/opportunity ratio is the canary on signal quality.
3. Roll telemetry into the existing admin observability stack before starting Wave 2 — Wave 2 widgets all rely on these events to measure activation lift.
