# ContentCard

AI-powered social media content platform. Monorepo — FastAPI backend + React frontend.

---

## Local Development

### 1 — Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL running locally

### 2 — Backend

```bash
cd backend

# Create virtualenv
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and fill in env vars
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL and ANTHROPIC_API_KEY

# Create database
psql -U postgres -c "CREATE DATABASE contentcard;"

# Start server
uvicorn app.main:app --reload --port 8000
```

Tables are auto-created on first start. Trending topics are auto-seeded.
API docs: http://localhost:8000/docs

### 3 — Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy env
cp .env.example .env.local
# .env.local should contain:
# VITE_API_URL=http://localhost:8000/api/v1

# Start dev server
npm run dev
```

Open: http://localhost:5173

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@localhost:5432/contentcard` |
| `SECRET_KEY` | Random string, min 32 chars |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook settings |
| `STRIPE_PRICE_STARTER` | Stripe Price ID for Starter ($25/mo) |
| `STRIPE_PRICE_SMB` | Stripe Price ID for SMB ($50/mo) |
| `STRIPE_PRICE_PRO` | Stripe Price ID for Pro ($100/mo) |
| `PAYSTACK_SECRET_KEY` | From Paystack dashboard |
| `PAYSTACK_PUBLIC_KEY` | From Paystack dashboard |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `BANNERBEAR_API_KEY` | From Bannerbear dashboard |
| `BANNERBEAR_TEMPLATE_COVER` | Cover template UID |
| `BANNERBEAR_TEMPLATE_CONTENT` | Default content template UID |
| `BANNERBEAR_TEMPLATE_QUOTE` | Quote template UID |
| `BANNERBEAR_TEMPLATE_HOOK` | Optional hook-slide template UID |
| `BANNERBEAR_TEMPLATE_PROMO` | Optional promo/offer template UID |
| `BANNERBEAR_TEMPLATE_EDU` | Optional educational/explainer template UID |
| `BANNERBEAR_TEMPLATE_TESTIMONIAL` | Optional testimonial/social-proof template UID |
| `BANNERBEAR_TEMPLATE_HIRING` | Optional hiring/recruitment template UID |
| `BANNERBEAR_TEMPLATE_TEXT_POSTER` | Optional text-poster template UID (headline-led) |
| `BANNERBEAR_TEMPLATE_PRODUCT_HERO` | Optional product-hero template UID (device/screenshot-led) |
| `BANNERBEAR_TEMPLATE_DATA_CARD` | Optional data-card template UID (insight/chart/card layouts) |
| `BANNERBEAR_TEMPLATE_ANNOUNCEMENT` | Optional announcement/event template UID |
| `BANNERBEAR_TEMPLATE_STORY_CAROUSEL` | Optional story/testimonial carousel template UID |
| `BANNERBEAR_TEMPLATE_ILLUSTRATION_EDITORIAL` | Optional illustration/editorial template UID |
| `QUALITY_GATE_ENABLED` | `true`/`false` creative QA gate before marking visuals ready |
| `QUALITY_GATE_MIN_SCORE` | Minimum gate score (e.g. `0.66`) |
| `QUALITY_GATE_MAX_RETRIES` | Auto-retry attempts after first failed render (e.g. `2`) |
| `MAX_REAL_PEOPLE_SHARE` | Cap people-photo share in monthly plan (default `0.35`) |
| `FRONTEND_URL` | `http://localhost:5173` (dev) or your prod URL |
| `FREE_TRIAL_DAYS` | `14` |
| `SOCIAL_AUTOPILOT_GLOBAL_KILL_SWITCH` | Emergency global stop for all autopilot publish preflights |
| `SOCIAL_AUTOPILOT_MIN_QUALITY_SCORE` | Minimum score allowed by social preflight quality gate |
| `SOCIAL_DEDUPE_WINDOW_DAYS` | Duplicate content lookback window for social preflight |
| `SOCIAL_WEBHOOK_SECRET` | Shared HMAC secret used to verify n8n publish callbacks |
| `SOCIAL_N8N_BASE_URL` | Base URL of self-hosted n8n instance |
| `SOCIAL_OAUTH_STATE_SECRET` | Secret for signing OAuth state payloads |
| `SOCIAL_OAUTH_CALLBACK_BASE_URL` | Public API base used to build OAuth callback URLs |
| `META_CLIENT_ID` | Meta app client ID (Facebook/Instagram OAuth) |
| `META_CLIENT_SECRET` | Meta app client secret |
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `SOCIAL_N8N_TOKEN_SINK_PATH` | n8n webhook path that receives exchanged OAuth tokens securely |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | `http://localhost:8000/api/v1` |

---

## Stripe Setup

1. Create 3 products in Stripe dashboard: **Starter** ($25), **SMB** ($50), **Pro** ($100)
2. Add a monthly recurring price to each product
3. Copy the `price_...` IDs into `STRIPE_PRICE_*` env vars
4. Add webhook endpoint: `https://your-api-url/api/v1/billing/webhook/stripe`
5. Subscribe to: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`
6. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

## Paystack Setup

1. Create 3 plans: **Starter** (₦20,000/mo), **SMB** (₦50,000/mo), **Pro** (₦200,000/mo)
2. Set callback URL in Paystack to: `https://your-api-url/api/v1/billing/webhook/paystack/verify`

---

## Deploy to Render

1. Push monorepo to GitHub
2. In Render dashboard → New → Blueprint → connect your repo
3. `render.yaml` provisions: backend web service + frontend static site + PostgreSQL
4. Set the `sync: false` env vars manually in Render dashboard after first deploy:
   - All `*_KEY`, `*_SECRET` values
   - `STRIPE_PRICE_*` IDs
   - `BANNERBEAR_TEMPLATE_*` IDs (at minimum: cover/content/quote; optional family templates for promo/edu/testimonial/hiring/text-poster/product-hero/data-card/announcement/story/illustration-editorial)
   - `FRONTEND_URL` = your Render frontend URL (e.g. `https://contentcard-web.onrender.com`)
   - `VITE_API_URL` = your backend URL + `/api/v1`

---

## Staging Environment

Use a dedicated `staging` branch and Render staging Blueprint so you can test safely before production.

### Branch flow

1. Keep `main` as production-only.
2. Create and keep a long-lived `staging` branch:
   - `git checkout -b staging` (first time)
   - `git push -u origin staging`
3. Merge feature branches into `staging` first.
4. After validation, merge `staging` into `main`.

### Render staging setup

1. In Render dashboard, create a second Blueprint using `render.staging.yaml`.
2. This staging Blueprint provisions:
   - `contentcard-api-staging`
   - `contentcard-web-staging`
   - `contentcard-db-staging`
3. Because services are pinned to `branch: staging`, staging auto-deploys from `staging` only.
4. Set staging secrets/env vars in the staging services (same keys as prod, but staging values where applicable).
5. Set:
   - staging backend `FRONTEND_URL` to staging frontend URL
   - staging frontend `VITE_API_URL` to staging backend URL + `/api/v1`

Note: staging DB uses `plan: free` in `render.staging.yaml` for low-cost testing. You can raise this to `basic-256mb` if you need more capacity.

---

## Payment Routing

Geo-detected automatically on signup:
- **Nigeria** (NG) → **Paystack** · prices shown in ₦
- **Everywhere else** → **Stripe** · prices shown in $

The user never sees a payment provider choice.

---

## API Reference

Full Swagger docs at `http://localhost:8000/docs`

---

## Design System Docs

- Bannerbear production template contract: `docs/BANNERBEAR_TEMPLATE_SPEC.md`
- Brand-level style profile can be set in `brand_kit.visual_system.style_mix_targets`, for example:
  - `text_poster`, `product_hero`, `illustration`, `people_photo` (values as 0.0–1.0 share targets)
- Admin design audit endpoint:
  - `GET /admin/design-readiness/{brand_id}` returns a readiness score and missing setup items (templates, visual tokens, style mix, brand core fields) before regeneration.

```
POST   /api/v1/auth/signup                     Create account + workspace + start trial
POST   /api/v1/auth/login
GET    /api/v1/auth/me
PUT    /api/v1/auth/me
POST   /api/v1/auth/change-password

GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/{id}/members
PUT    /api/v1/workspaces/{id}/members/{mid}
DELETE /api/v1/workspaces/{id}/members/{mid}

POST   /api/v1/workspaces/{id}/invites
GET    /api/v1/workspaces/{id}/invites
DELETE /api/v1/workspaces/{id}/invites/{iid}
GET    /api/v1/invites/{token}                 Public — get invite details
POST   /api/v1/invites/{token}/accept          Public — create account + join workspace

GET    /api/v1/workspaces/{id}/brands
POST   /api/v1/workspaces/{id}/brands
GET    /api/v1/workspaces/{id}/brands/{bid}
PUT    /api/v1/workspaces/{id}/brands/{bid}
DELETE /api/v1/workspaces/{id}/brands/{bid}
POST   /api/v1/workspaces/{id}/brands/{bid}/logo

POST   /api/v1/content/generate-month          Background task — returns 202
POST   /api/v1/content/generate-photo-caption
GET    /api/v1/content?brand_id=&month=&year=
GET    /api/v1/content/{id}
PUT    /api/v1/content/{id}                    Save caption edits
POST   /api/v1/content/{id}/regenerate
DELETE /api/v1/content/{id}

GET    /api/v1/templates?brand_id=
POST   /api/v1/templates
PUT    /api/v1/templates/{id}
DELETE /api/v1/templates/{id}

GET    /api/v1/trends

POST   /api/v1/billing/checkout                Returns checkout_url to redirect user
GET    /api/v1/billing/{workspace_id}
POST   /api/v1/billing/cancel/{workspace_id}
POST   /api/v1/billing/webhook/stripe
GET    /api/v1/billing/webhook/paystack/verify

POST   /api/v1/social/connections/{platform}/connect
POST   /api/v1/social/connections/{platform}/disconnect
POST   /api/v1/social/connections/{platform}/oauth/start
GET    /api/v1/social/connections/{platform}/oauth/callback
GET    /api/v1/social/connections?brand_id=
GET    /api/v1/social/connections/health?brand_id=
POST   /api/v1/social/connections/{platform}/token/refresh-callback
GET    /api/v1/social/autopilot/config?brand_id=
POST   /api/v1/social/autopilot/config
POST   /api/v1/social/posts/queue
GET    /api/v1/social/posts/dead-letter?brand_id=
POST   /api/v1/social/posts/{id}/retry
POST   /api/v1/social/publish/preflight
POST   /api/v1/social/publish/callback
GET    /api/v1/social/posts?brand_id=
GET    /api/v1/social/comments?brand_id=
POST   /api/v1/social/comments/ingest
POST   /api/v1/social/comments/{id}/reply
GET    /api/v1/social/metrics/summary?brand_id=
GET    /api/v1/social/ops/alerts?brand_id=

POST   /api/v1/upload/photo

GET    /health
```

Social autopilot/n8n integration docs:
- `docs/social-autopilot-n8n-workflow.md`
- `docs/n8n-social-publish-workflow.template.json`
- `docs/PRD-social-autopilot-implementation-checklist.md`
