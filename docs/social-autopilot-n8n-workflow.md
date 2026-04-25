# Social Autopilot n8n Workflow Contract (v1)

This document describes the minimal n8n flow that works with the current ContentCard backend Social API.

## Required backend env vars

- `SOCIAL_WEBHOOK_SECRET`
- `SOCIAL_N8N_BASE_URL`
- `SOCIAL_OAUTH_STATE_SECRET`
- `SOCIAL_OAUTH_CALLBACK_BASE_URL`
- `META_CLIENT_ID`, `META_CLIENT_SECRET`
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

## OAuth connect flow

1. Client calls `POST /api/v1/social/connections/{platform}/oauth/start`.
2. Client redirects user to `authorization_url`.
3. Provider redirects to `GET /api/v1/social/connections/{platform}/oauth/callback`.
4. Backend validates signed state, exchanges OAuth code for access token, and marks connection `connected`.
5. Backend forwards exchanged token payload to n8n token sink (`SOCIAL_N8N_TOKEN_SINK_PATH`) signed with `x-social-signature`.

Note: app DB stores only metadata and an opaque token reference (`token_ref`), not plaintext provider tokens.

## Publish orchestration flow

1. **Trigger** (cron/queue) picks a candidate post.
2. **Preflight** calls `POST /api/v1/social/publish/preflight`.
3. If `allowed=false`, stop flow and mark as skipped in n8n logs.
4. If `allowed=true`, publish via platform API.
5. Send result to `POST /api/v1/social/publish/callback` with `x-social-signature`.
6. Optional metrics sync sends callback updates for same `idempotency_key`.
7. Optional comment polling flow posts ingested comments to `POST /api/v1/social/comments/ingest` with `x-social-signature`.
8. Token refresh worker posts updates to `POST /api/v1/social/connections/{platform}/token/refresh-callback` with `x-social-signature`.

## Callback signature

- Header: `x-social-signature`
- Value: `hex(hmac_sha256(SOCIAL_WEBHOOK_SECRET, raw_request_body))`

## Suggested retry policy

- Transient (429/5xx): exponential backoff, max 4 attempts.
- Permanent policy/provider validation errors: no retry.
- Always preserve and reuse the original `idempotency_key`.

## Ops monitoring endpoint

- `GET /api/v1/social/ops/alerts?brand_id=...`
- Returns token expiry warnings, failure streak alerts, and invalid signature counts.
