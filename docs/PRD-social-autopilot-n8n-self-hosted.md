# PRD: Social Autopilot via Self-Hosted n8n (Spam-Safe)

| Field | Value |
|---|---|
| Product | ContentCard |
| Author | Product / Growth Automation |
| Status | Draft for implementation |
| Problem | Users want to connect social accounts and automate publishing generated content, but unsafe autopost can create spam risk, policy violations, and brand damage. |
| Outcome | Reliable, policy-compliant social autopilot with clear controls, comment workflows, and post-performance visibility. |

---

## 1) Executive Summary

Build a social publishing orchestration layer with self-hosted `n8n` while keeping business-critical policy, state, and anti-spam logic inside ContentCard backend.

`n8n` handles workflow execution (scheduled posting, retries, connectors), while ContentCard remains source of truth for:
- approval and autopilot rules,
- safety scoring and anti-spam gates,
- idempotency and post ledgers,
- account and token lifecycle metadata,
- audit logs and kill switches.

---

## 2) Goals and Non-Goals

### Goals
- G1: Let users connect social accounts and publish generated posts automatically.
- G2: Support two modes: `approval required` and `autopilot`.
- G3: Prevent spam by default using quotas, cooldowns, dedupe, and policy checks.
- G4: Ingest comments and support assisted replies with human-in-the-loop controls.
- G5: Show core post metrics in dashboard and post detail views.

### Non-Goals
- Replacing official platform APIs or bypassing platform policies.
- Fully autonomous comment bots by default.
- Deep cross-platform analytics parity in v1 (metric coverage differs by API).

---

## 3) User Stories

- As a marketer, I can connect Instagram/Facebook/LinkedIn and schedule or autopost generated content.
- As a team lead, I can enable autopilot with strict safety controls and pause instantly.
- As a community manager, I can view recent comments and send suggested replies with approval.
- As an admin, I can audit exactly what posted, why it posted, and what failed.

---

## 4) Product Scope

## 4.1 v1 Platforms
- Meta (Facebook Pages, Instagram Business via Graph API)
- LinkedIn (Organization/Page posting)

## 4.2 v1 Capabilities
- OAuth account connect + reconnect.
- Queue posts from ContentCard generated items.
- Auto/scheduled publish with anti-spam checks.
- Publish ledger with status: `queued`, `posted`, `failed`, `skipped`.
- Basic metrics sync (impressions/reach/engagement/clicks where available).
- Comment ingest (where API supports) and reply workflow with approval.

## 4.3 v2+ (Later)
- Advanced moderation automations.
- Auto-reply policies by intent class.
- Expanded analytics and cohort reporting.

---

## 5) Architecture and Responsibilities

### ContentCard Backend (Source of Truth)
- Owns content eligibility and safety decision.
- Stores social connections metadata (never plaintext tokens in app DB).
- Issues signed execution jobs for n8n.
- Receives delivery callbacks and metric sync payloads.
- Enforces anti-spam and policy limits before every publish attempt.

### Self-Hosted n8n (Execution Layer)
- Runs platform-specific publish workflows.
- Handles retries/backoff for transient errors.
- Refreshes tokens via secure credential storage.
- Calls ContentCard preflight endpoint before final publish.
- Sends webhook callbacks with publish result and provider IDs.

### Data/Infra Requirements
- Postgres for ContentCard state.
- Redis + queue mode for n8n workers.
- n8n in HA-friendly deployment (at least 2 workers for production).
- Structured logging + alerting on failures and throttling.

---

## 6) Anti-Spam and Safety Model (Core)

All autopost flows must pass these checks in order:

1. **Eligibility**
- Post status is `approved` OR autopilot policy allows generated content class.
- Post has required media/caption fields per platform.

2. **Dedupe**
- `caption_hash + media_hash + platform + brand_id` uniqueness window (default 30 days).
- Reject near-duplicate variants under configured similarity threshold.

3. **Cadence Controls**
- Min interval per platform (e.g., 2-4 hours default).
- Daily max posts per platform (configurable by plan).
- Quiet hours by brand timezone.

4. **Quality and Risk Gate**
- Block if quality score below threshold.
- Block if compliance flags exist (missing disclaimer, banned phrase, unsafe claim).
- Optional human approval for high-risk content types.

5. **Platform Policy Gate**
- Hashtag cap and forbidden hashtag list.
- URL domain allowlist and UTM normalization.
- Media aspect/length format checks.

6. **Runtime Preflight**
- Final backend `POST /social/preflight` before n8n publish step.
- Includes kill-switch status and rate budget check.

If any check fails: mark as `skipped` with explicit reason and surface in UI.

---

## 7) Autopilot Modes

- `manual_only`: users publish manually from queue.
- `approval_required`: autopilot schedules only approved items.
- `smart_autopilot`: publishes approved + policy-eligible generated items.

Autopilot defaults:
- Off by default.
- Requires explicit user opt-in and onboarding checklist completion.
- Starts in conservative mode (`approval_required`) for first 7 days.

---

## 8) Comment Replies

V1 reply model:
- Ingest comments/replies where API permissions allow.
- Run intent/toxicity classification.
- Generate reply suggestions only.
- Require human approval by default.

Optional aggressive mode (later):
- Auto-reply only for low-risk intents (thanks, FAQ) with strict templates and stop words.

Safety:
- Never auto-reply to abusive/legal/financial-risk intents.
- Enforce per-thread and per-day reply caps.

---

## 9) Metrics and Reporting

Minimum v1:
- Post-level: published time, platform post ID, reach/impressions, engagement, link clicks (if available).
- Dashboard: posts published by platform, engagement rate trend, best posting windows.
- Alerting: consecutive post failures, token expiry, webhook failures, platform throttling.

Data freshness:
- Near real-time publish status.
- Metrics sync every 1-6 hours depending on platform quotas.

---

## 10) API and Workflow Contracts

ContentCard endpoints (proposed):
- `POST /social/connections/{platform}/connect`
- `POST /social/connections/{platform}/disconnect`
- `GET /social/connections`
- `POST /social/autopilot/config`
- `POST /social/publish/preflight`
- `POST /social/publish/callback`
- `GET /social/posts`
- `GET /social/comments`
- `POST /social/comments/{id}/reply`
- `GET /social/metrics/summary`

n8n workflow stages (per platform):
1. Trigger (schedule or queue event)
2. Fetch pending item
3. Call preflight
4. Publish via platform node/API
5. Callback with result
6. Schedule metrics sync job

Idempotency:
- Every publish attempt uses `idempotency_key = brand_id + platform + content_item_id + scheduled_slot`.
- Duplicate callbacks must be no-op.

---

## 11) Reliability and SLOs

SLO targets (v1 production):
- Publish success rate (eligible posts): >= 98%
- Duplicate publish rate: <= 0.1%
- Median publish delay from scheduled time: <= 3 minutes
- Webhook callback processing success: >= 99.5%

Operational controls:
- Circuit breaker per platform if error spike threshold exceeded.
- Global and per-brand kill switches.
- Dead-letter queue for failed publish attempts.
- Automatic token health checks and expiry alerts.

---

## 12) Security and Compliance

- Use official OAuth scopes only; least privilege by platform.
- Encrypt tokens at rest in secrets manager (not plaintext DB).
- Signed webhook verification between n8n and ContentCard.
- Full audit log for account connect/disconnect, publish decisions, and replies.
- Per-workspace RBAC: only authorized roles can enable autopilot or auto-replies.

---

## 13) UX Requirements

- Social Accounts page: connection health, token expiry, reconnect action.
- Autopilot settings: mode, cadence caps, quiet hours, kill switch.
- Queue view: why each item is approved/blocked/skipped.
- Post detail: publish attempts + provider IDs + metrics card.
- Comments inbox: filters, suggested replies, approval actions.

---

## 14) Rollout Plan

### Phase 0 (Internal)
- Meta + LinkedIn manual queue publish.
- No autopilot, no auto-reply.

### Phase 1 (Beta)
- `approval_required` autopilot for selected brands.
- Anti-spam gates enforced and observable.
- Basic metrics sync.

### Phase 2 (GA)
- `smart_autopilot` with stricter policy templates.
- Comment suggestion workflow.
- Reliability SLO reporting and on-call runbooks.

---

## 15) Success Metrics

- Activation: % brands that connect at least 1 social account.
- Adoption: % active brands enabling autopilot.
- Safety: spam/duplicate incident rate per 1,000 posts.
- Reliability: publish success and delay SLO attainment.
- Business: uplift in consistent posting frequency and engagement per brand.

---

## 16) Open Questions

- Which platform enters GA first if API approvals are delayed?
- Should we expand beyond Meta + LinkedIn only after v1 stability targets are met?
- What is the default minimum quality threshold for autopilot eligibility?

---

## 17) Decision Summary

Yes, self-hosted `n8n` is a viable and reliable orchestration layer for social automation, but only if anti-spam policy, decisioning, and auditability remain centralized in ContentCard backend. This PRD sets that split clearly so autopilot can scale without becoming a spam engine.

---

## 18) Next Steps Before Build (Short Checklist)

To start implementation with safest/cheapest/easiest defaults, complete these first:

1. Deploy self-hosted `n8n` with Postgres on a managed host (recommended: Railway) and enable HTTPS domain.
2. Configure `n8n` security baseline: editor basic auth, `N8N_ENCRYPTION_KEY`, persistent DB, no public signup.
3. Create Meta app (Instagram/Facebook) and LinkedIn app; set OAuth callback URLs for ContentCard backend.
4. Decide default autopilot policy:
   - mode: `approval_required`
   - max posts/day/platform: `2`
   - min gap: `4h`
   - quiet hours: `22:00-07:00` (brand timezone)
   - comment auto-reply: off (suggestions + approval only)
5. Enable operational safety switches: global kill switch + per-brand kill switch + signed webhook verification.
6. Prepare one test brand with IG Business + FB Page + LinkedIn Page admin access for end-to-end validation.

Implementation should begin only after this checklist is complete.

