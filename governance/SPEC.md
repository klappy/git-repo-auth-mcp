# SPEC — git-repo-auth-mcp with metered tiers

Per P0006 (vodka boundary enumeration), this spec opens with the three lists. Everything else derives from `governance/`.

## What the server knows

- The GitHub App private key, App ID, and OAuth client credentials (worker secrets)
- Its own OAuth grants: which GitHub user is bound to which installation (hashed, KV — shipped in v0.2)
- Billing state per GitHub user: Stripe customer id, tier, subscription status, free-bucket balance
- Mint history: timestamps and scope hashes, enough to answer window/weekly counts and feed the Stripe meter
- The current quota policy, read at runtime from `governance/external/tiers.md`

## What the server does NOT know

- User passwords, GitHub user tokens beyond the two login GETs (discarded), or any long-lived GitHub credential
- Card numbers or any payment instrument — Stripe holds all of it
- Repository contents — it mints capability; it never exercises it
- Anything about a user who has not connected; no tracking surface beyond mint accounting

## What this server is NOT

- **NOT a billing system** — it is a Stripe customer; Stripe is the source of truth and the payment UI
- **NOT a GitHub proxy** — tokens go to the client; API traffic never transits this worker
- **NOT a policy engine** — it enforces numbers it reads from governance docs; it owns none of them
- **NOT a docs CMS** — the `docs` tool serves `governance/external/` verbatim, per the P0004 docs-proxy convention
- **NOT an identity provider beyond its own grants** — GitHub is the identity; the worker only binds grant → installation

## Surface

- `github_token(repositories?, permissions?)` — existing tool, gains quota enforcement and transparency fields (`tier`, `remaining`, `window_reset_at`, `weekly_remaining`, `cached`)
- `docs(query)` — new tool; retrieval over `governance/external/`
- `/webhooks/stripe` — new endpoint; signature-verified, idempotent
- OAuth + install flows — shipped, unchanged

## Authority

Tier numbers: `governance/external/tiers.md` (runtime source). Rationale: `governance/internal/pricing-decisions.md`. Architecture: `governance/internal/billing-architecture.md`. Release: `klappy://canon/constraints/release-validation-gate`.
