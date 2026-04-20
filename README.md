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
| `QUALITY_GATE_ENABLED` | `true`/`false` creative QA gate before marking visuals ready |
| `QUALITY_GATE_MIN_SCORE` | Minimum gate score (e.g. `0.66`) |
| `QUALITY_GATE_MAX_RETRIES` | Auto-retry attempts after first failed render (e.g. `2`) |
| `FRONTEND_URL` | `http://localhost:5173` (dev) or your prod URL |
| `FREE_TRIAL_DAYS` | `14` |

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
   - `BANNERBEAR_TEMPLATE_*` IDs (at minimum: cover/content/quote; optional family templates for promo/edu/testimonial/hiring)
   - `FRONTEND_URL` = your Render frontend URL (e.g. `https://contentcard-web.onrender.com`)
   - `VITE_API_URL` = your backend URL + `/api/v1`

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

POST   /api/v1/upload/photo

GET    /health
```
