# Social Autopilot PRD Implementation Checklist

This checklist maps PRD items to what is implemented in the repo vs what still requires external setup.

## In-repo implementation status

- [x] Social connection domain models and API surfaces
- [x] OAuth start/callback endpoints for Meta + LinkedIn
- [x] OAuth state signing/verification
- [x] Token metadata/reference storage (no plaintext tokens in DB)
- [x] n8n token sink forwarding contract
- [x] Autopilot configuration storage and retrieval
- [x] Safety preflight endpoint and policy gate chain
- [x] Dedupe + cadence + quiet-hours enforcement
- [x] Quality/compliance/disclaimer/hashtag/domain/media checks
- [x] Publish callback endpoint with signature verification
- [x] Publish ledger (`queued`, `posted`, `failed`, `skipped`)
- [x] Dead-letter queue listing + retry endpoint
- [x] Comment ingest endpoint + reply workflow endpoint
- [x] Metrics summary endpoint
- [x] Token health endpoint + refresh callback endpoint
- [x] Ops alerts endpoint (token expiry/failure streak/signature failures)
- [x] Frontend Social page (connections/settings/preflight/ledger/comments/alerts/dead-letter)
- [x] n8n workflow contract docs + template JSON

## Outside-repo dependencies (must be completed externally)

These are required for full production PRD completion but cannot be finished by code changes in this repo alone.

### Platform and OAuth app setup

- [ ] Meta app creation, review, and scope approval in Meta developer dashboard
- [ ] LinkedIn app creation and scope approval in LinkedIn developer portal
- [ ] Correct OAuth callback URLs configured in provider dashboards for each environment

### n8n deployment and operations

- [ ] Self-hosted n8n deployment with persistent DB + queue workers + HTTPS
- [ ] n8n auth hardening (`N8N_ENCRYPTION_KEY`, no public signup, editor auth)
- [ ] Live publish workflows for Meta + LinkedIn (actual connector/API nodes)
- [ ] Token refresh workflows and schedule in n8n
- [ ] Comment polling/ingest workflows in n8n
- [ ] Retry/backoff and dead-letter handling behavior finalized in workflows

### Infrastructure/monitoring

- [ ] Redis/queue infrastructure configured for n8n workers
- [ ] Centralized logs + metrics + alert routing (PagerDuty/Slack/on-call)
- [ ] Production runbook for incident handling and platform outages

### Secrets and compliance

- [ ] Secret manager or vault integration for token storage in execution layer
- [ ] Production secret rotation policies and access controls
- [ ] Legal/compliance review for auto-posting policies and moderation behavior

## Recommended validation sequence

1. Complete OAuth app setup and callback URLs.
2. Deploy n8n and import workflow template.
3. Configure token sink and signed callback secrets.
4. Connect one test brand account per platform.
5. Run preflight tests from UI and verify expected blocks.
6. Execute one real publish end-to-end and confirm callback + ledger updates.
7. Validate comment ingest and reply approval flow.
8. Validate dead-letter + retry behavior.
9. Confirm ops alerts and token expiry warnings.
