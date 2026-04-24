# PRD: Shopify Login/Signup + Autofill Trial Onboarding

| Field | Value |
|---|---|
| Product | ContentCard |
| Author | Product / Growth |
| Status | Draft for implementation |
| Problem | Shopify merchants face friction creating accounts and filling setup details before seeing value. |
| Outcome | One-click Shopify auth that auto-fills setup data, then sends users to subscribe or skip and test with free generations immediately. |

---

## 1) Executive Summary

Add **Shopify OAuth login/signup** so merchants can authenticate using their Shopify account, auto-populate essential business/profile fields, and start using ContentCard quickly.

After authentication:
- New users see a simple decision step: **Subscribe now** or **Skip and try free generations**.
- If they skip, they land directly in product flow with free-generation credits.
- If they subscribe, they complete checkout and continue onboarding with premium limits.

Goal: reduce signup friction, increase activation rate, and improve paid conversion from qualified Shopify merchants.

---

## 2) Goals and Non-Goals

### Goals
- G1: Allow Shopify users to sign up/log in via OAuth in <= 2 clicks.
- G2: Auto-fill business/account details from Shopify store profile.
- G2b: Pull Shopify catalog data and prefill brand kit/product context end-to-end.
- G3: Route users to a post-auth decision: subscribe now or skip to free trial usage.
- G4: Ensure safe account linking (idempotent, no duplicate users/workspaces).
- G5: Maintain billing compatibility with current plan/trial/free-generation system.
- G6: Ensure logo setup is completed automatically from Shopify assets when available.

### Non-Goals
- Deep Shopify app marketplace listing optimization in v1.
- Full order-history analytics and attribution sync from Shopify in auth v1.
- Replacing existing email/password auth (Shopify auth is additive).

---

## 3) Primary User Stories

- As a Shopify store owner, I can sign in with Shopify without creating another password.
- As a new merchant, my store/business details are prefilled so setup is fast.
- As a user, after login I can choose to subscribe now or skip and test with free generations.
- As an admin, I can see how many users sign up through Shopify and how they convert.

---

## 4) Scope

## 4.1 In Scope (v1)
- Shopify OAuth start + callback.
- Account creation/login based on verified Shopify identity.
- Workspace + brand bootstrap from Shopify store metadata.
- Pull active Shopify products (title, handle, image, price range, category/type) for brand context.
- Auto-populate brand kit fields from Shopify + store metadata (tone hints, value props, product pillars).
- Enforce logo bootstrap from Shopify brand assets as part of onboarding completion.
- Post-auth “Subscribe or Skip” gate.
- Free-generation path preserved if user skips.
- Basic analytics events and attribution for Shopify auth funnel.

## 4.2 Out of Scope (v1)
- Historical orders/customers deep sync.
- Shopify webhooks beyond basic app uninstall/token invalidation.
- Multi-store account management UX.

---

## 5) UX Flow

### 5.1 Entry Points
- Login page: `Continue with Shopify`
- Signup page: `Sign up with Shopify`

### 5.2 OAuth Flow
1. User clicks Shopify auth CTA.
2. Redirect to Shopify OAuth consent.
3. Shopify redirects back to ContentCard callback.
4. Backend verifies HMAC/state and exchanges code for token.
5. Backend fetches store profile data.
6. Backend fetches Shopify products and key merchandising metadata.
7. Backend creates or links user/workspace/brand and fills brand kit defaults.
8. Backend imports logo asset from Shopify brand/store data (fallback chain if primary missing).
9. Redirect to post-auth decision screen.

### 5.3 Post-auth Decision Screen
- Title: `You are in. Choose how to continue`
- Options:
  - `Subscribe now` (paid flow)
  - `Skip for now, try free` (free generations path)
- Copy should be plain-English and non-technical.

### 5.4 Skip Path
- User is routed to dashboard with free-generation allowance visible.
- Product flow starts immediately (generate/test).

### 5.5 Subscribe Path
- User goes to checkout flow (existing billing integration).
- On completion, returns to dashboard with paid entitlements.

---

## 6) Data Model Changes

Add/extend fields:

- `users`
  - `auth_provider` (`password`, `shopify`, `mixed`)
  - `shopify_shop_domain` (nullable)
  - `shopify_customer_id` (nullable)

- New table: `shopify_connections`
  - `id`
  - `user_id`
  - `workspace_id`
  - `shop_domain` (unique)
  - `access_token_ref` (reference only, no plaintext token)
  - `scope`
  - `connected_at`
  - `last_sync_at`
  - `status` (`connected`, `revoked`, `error`)
  - `metadata` (JSON)

- `brands` bootstrap fields from Shopify:
  - name, website, industry (if inferable), location, logo URL, etc.

- New table: `shopify_product_snapshots` (or reuse existing website/product intelligence model with source=`shopify`)
  - `id`
  - `workspace_id`
  - `brand_id`
  - `shop_domain`
  - `product_id`
  - `title`
  - `handle`
  - `description`
  - `primary_image_url`
  - `price_min`
  - `price_max`
  - `currency`
  - `product_type`
  - `tags`
  - `status`
  - `synced_at`

---

## 7) API Contracts (Proposed)

- `GET /auth/shopify/start`
  - query: optional `next`
  - returns redirect URL or redirects directly.

- `GET /auth/shopify/callback`
  - query: `code`, `hmac`, `shop`, `state`, `timestamp`
  - verifies signature/state, exchanges token, upserts user, sets session/JWT.

- `POST /auth/shopify/disconnect`
  - revoke/unlink Shopify connection for current user/workspace.

- `GET /auth/post-signup-decision`
  - returns if user should see subscribe/skip step.

- `POST /auth/post-signup-decision`
  - body: `{ decision: "subscribe_now" | "skip_free" }`
  - routes to billing or dashboard path.

- `POST /auth/shopify/bootstrap/sync`
  - re-run Shopify bootstrap sync for profile + products + logo if initial import was partial.

---

## 8) Security and Compliance

- Verify Shopify callback HMAC strictly.
- Signed/expiring state token for CSRF prevention.
- Never store raw Shopify access token in app DB; store token reference and keep plaintext in secure secrets layer.
- Enforce HTTPS callbacks only.
- Audit log auth/link/disconnect events.
- Handle app uninstall/revocation by marking connection status and prompting reconnect.

---

## 9) Entitlements and Billing Behavior

- `skip_free` path:
  - user remains on trial/free policy (existing free generations cap).
- `subscribe_now` path:
  - existing billing checkout.
  - entitlements update on successful payment.
- Existing free-generation logic remains source of truth.

---

## 10) Autofill Rules

Populate where available:
- Workspace name <- Shopify shop/store name
- Brand name <- store name
- Website <- primary domain
- Location/country <- shop profile
- Logo <- shop brand assets (**required for onboarding completion**; fallback chain below)
- Contact email <- Shopify account email (if allowed/safe)
- Product catalog <- active products and key merchandising fields
- Brand kit <- auto-fill from store description, product types, top product titles/tags, and policy pages when available

Logo fallback chain (automatic):
1. Shopify brand/store logo
2. Theme logo asset
3. OG image/favicon from storefront domain
4. If all fail: keep onboarding incomplete and prompt user for upload once (single required action)

Fallback:
- If field unavailable, leave blank and ask user minimally in onboarding.

---

## 11) Edge Cases

- Existing ContentCard user logs in with Shopify email:
  - Link identities instead of creating duplicate account.
- Existing workspace already linked to same shop:
  - Reuse connection idempotently.
- Shopify callback replay:
  - Idempotent handling with state nonce + timestamp checks.
- Missing scopes:
  - Continue auth but show reconnect prompt with required scopes.
- Incomplete profile/brand kit after Shopify bootstrap:
  - If required onboarding fields are missing (for example: brand name, logo, core brand kit fields, or no usable product context), route user to a `Complete your onboarding` form instead of normal dashboard redirect.
  - The form must render only missing required fields; fields already populated from Shopify/bootstrap must not be shown as editable in this step.
  - Block onboarding completion until all shown missing required fields are submitted.
  - After successful submission, continue to post-auth decision (`subscribe_now` or `skip_free`) and mark onboarding as complete.

---

## 12) Admin and Observability

Track events:
- `shopify_auth_started`
- `shopify_auth_succeeded`
- `shopify_auth_failed`
- `shopify_postauth_subscribe_clicked`
- `shopify_postauth_skip_clicked`
- `shopify_user_activated` (first generation completed)

Dashboard metrics:
- Shopify signup conversion rate
- Skip vs subscribe split
- Activation within 24h
- Paid conversion within 7/30 days

---

## 13) Rollout Plan

### Phase 0 (Internal)
- Enable on staging only.
- Test with internal Shopify dev stores.

### Phase 1 (Beta)
- Enable for subset of production traffic (feature flag).
- Monitor auth success/error rates.

### Phase 2 (GA)
- Expose on login/signup pages broadly.
- Iterate copy and post-auth decision UX for conversion.

---

## 14) Success Metrics

- Auth success rate >= 98%
- Shopify-to-activated-user rate >= 60%
- Median time from auth success to first generation <= 10 min
- 7-day paid conversion uplift vs non-Shopify cohort

---

## 15) Engineering Checklist

- [ ] Backend Shopify OAuth endpoints + HMAC verification
- [ ] Token storage reference model + secure token sink integration
- [ ] User/workspace/brand idempotent bootstrap logic
- [ ] Shopify product snapshot sync at auth callback (paginated, retry-safe)
- [ ] Brand kit autofill mapping from shop/profile/product metadata
- [ ] Logo import pipeline with fallback chain and onboarding completion rule
- [ ] Post-auth subscribe/skip decision endpoint + persistence
- [ ] Frontend login/signup Shopify CTA + callback handling
- [ ] Decision screen UX
- [ ] Feature flag for gradual rollout
- [ ] Tracking events and admin funnel reporting
- [ ] Tests: auth happy path, replay, duplicate account link, missing scopes

---

## 16) Open Questions

- Which Shopify scopes are minimum required for profile + product sync + logo extraction?
- Should one ContentCard user be allowed to connect multiple Shopify stores in v1?
- Should skip path always grant same free generation count, or Shopify cohort-specific allowance?

---

## 17) Decision Summary

Implementing Shopify OAuth with autofill + subscribe/skip gate directly addresses merchant onboarding friction and aligns with a fast “see value now” strategy. This PRD keeps v1 focused on acquisition + activation while preserving existing billing and entitlement systems.

---

## 18) Integration Setup Checklist (Keys, Where to Find, Where to Put)

Use this section as the go-live checklist for Shopify auth integration.

### 18.1 Required Shopify Credentials

- Shopify app `Client ID` (API key)
  - Find in: Shopify Partner Dashboard -> Apps -> [Your App] -> API credentials
  - Put in backend env: `SHOPIFY_CLIENT_ID`

- Shopify app `Client Secret`
  - Find in: Shopify Partner Dashboard -> Apps -> [Your App] -> API credentials
  - Put in backend env (secret): `SHOPIFY_CLIENT_SECRET`

- Shopify app scopes (for profile + product + logo bootstrap)
  - Set in: Shopify Partner Dashboard -> Apps -> [Your App] -> Configuration / Admin API access scopes
  - Mirror in backend env: `SHOPIFY_SCOPES` (comma-separated)

- Shopify callback URL allowlist
  - Set in: Shopify Partner Dashboard -> Apps -> [Your App] -> App setup / Allowed redirection URL(s)
  - Must include:
    - `https://<api-domain>/api/v1/auth/shopify/callback` (prod)
    - `https://<staging-api-domain>/api/v1/auth/shopify/callback` (staging)

### 18.2 Required App/Auth Secrets

- OAuth state signing secret
  - Generate: `openssl rand -hex 32`
  - Put in backend env (secret): `SHOPIFY_OAUTH_STATE_SECRET`

- Session/JWT secret (if not already configured)
  - Generate strong random secret
  - Put in backend env (secret): existing auth secret used by your backend (for example `SECRET_KEY` / JWT signing key)

- Encryption key for token reference system (if applicable)
  - Put in backend secrets manager/env used by token sink service
  - Never store raw Shopify tokens in regular DB columns

### 18.3 Frontend Configuration

- API base URL for auth redirects/callback handoff
  - Put in frontend env:
    - local: `frontend/.env` -> `VITE_API_URL=...`
    - production: Render Static Site env var `VITE_API_URL`

- Feature flag for staged rollout
  - Put in frontend env or remote config:
    - `VITE_SHOPIFY_AUTH_ENABLED=true|false`
  - Default recommended: `false` in prod until staging passes.

### 18.4 Backend Configuration (Where to Put)

- Local development:
  - `backend/.env` for local-only testing values.

- Staging on Render:
  - Render Dashboard -> `contentcard-api-staging` -> Environment
  - Add all Shopify/auth variables there.

- Production on Render:
  - Render Dashboard -> `contentcard-api` -> Environment
  - Add all Shopify/auth variables there.

### 18.5 Minimum Env Var Set (Backend)

- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_SCOPES`
- `SHOPIFY_OAUTH_CALLBACK_URL` (or derive from API base URL)
- `SHOPIFY_OAUTH_STATE_SECRET`
- `APP_BASE_URL` (frontend app URL for post-auth redirect)
- `API_BASE_URL` (backend public URL, if callback builder depends on it)

### 18.6 Post-Setup Verification

- [ ] Click `Continue with Shopify` and confirm redirect to Shopify consent screen.
- [ ] Confirm callback succeeds with HMAC/state verification.
- [ ] Confirm user/workspace/brand are created or linked idempotently.
- [ ] Confirm product snapshot sync runs and logo autofill attempts fallback chain.
- [ ] Confirm incomplete-data path shows only missing required fields.
- [ ] Confirm subscribe/skip decision screen appears after onboarding completion.
- [ ] Confirm auth and funnel events are emitted in analytics.

### 18.7 Ownership Recommendation

- Product owner: confirm required fields for onboarding completion.
- Backend owner: Shopify OAuth, HMAC/state, token sink, bootstrap sync.
- Frontend owner: CTA, callback UX, missing-fields-only onboarding form.
- DevOps owner: Render env vars in staging/prod and secret rotation policy.
