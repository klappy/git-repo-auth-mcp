# Pricing Model — Decision Record

Session: 2026-06-10, captain + first officer, pressure-tested via `oddkit_challenge` (planning mode). DOLCHEO artifacts below; the session journal carries the narrative.

## [D] Free tier is a one-time 50-mint bucket with a hard stop

When the bucket is empty, minting fails with an upgrade path. **Rejected: decay model** (large burst, then 1/day trickle for 30 days) — a trickle after the burst is worse than nothing; it converts frustration, not value. **Rejected: flat small weekly limit** — it gates the discovery moment; 10 cautious mints never produce the "oh, this changes things" experience that converts. Rationale: the product's value lands on first real contact (an agent working your actual repos); give the full experience, then a clean wall. Bucket expiry deferred — not needed at launch, trivially addable in this doc later.

## [D] Paid tiers sell minted concurrency, not mint volume

Unit: tokens minted per rolling 5-hour window ≈ concurrent agents, because tokens live ≤1 hour. Pro 5 / Max 5x 25 / Max 20x 100; weekly backstops 60/300/1,200 (12×, abuse-only, modeled on Claude's dual-window pattern where <2% of users ever touch the weekly cap). **Minted** rather than **active** concurrency: no lease/heartbeat machinery, and hitting the wall forces the honest "am I actually using this" question. Rationale: concurrency is the truthful name for what heavy users consume, and it self-sorts personas — one efficient agent stays on Pro, a 50-agent fleet needs Max 20x.

## [D] Cached same-scope re-requests don't count as mints

Serve the live token, mark `cached: true`, spend no quota. Rationale: GitHub's own best practice (reuse installation tokens until near expiry), and retries must be quota-neutral or the limits punish flaky networks instead of pricing concurrency.

## [D] Full quota transparency on every response

`tier`, `remaining`, `window_reset_at`, `weekly_remaining`, `cached` on success; `limit_hit` + `upgrade_url` on failure. Rationale: the wall must never be a surprise, and the response itself teaches the agent to manage quota — the docs tool then explains the system in depth. Captain's explicit call: nothing hidden.

## [D] Identity: already built — REVISED AGAINST OBSERVED REALITY

Planning assumed identity needed building and challenge suggested reusing the shared klappy.dev Supabase bearer middleware. **The clone showed both wrong:** this repo already ships per-user OAuth 2.1 (dynamic client registration, PKCE) via `@cloudflare/workers-oauth-provider`, GitHub login, and per-grant installation binding. Multi-tenant identity is **done**. The build scope reduces to: billing, quota state, transparency fields, docs tool. (Process learning recorded in the journal — E0010.)

## [D] Stripe is the billing source of truth

Every mint reports to a Stripe Billing Meter regardless of tier (so pricing-model changes never need re-plumbing). Entitlements derive from subscription status, cached in worker state and re-synced at auth time; webhooks (`checkout.session.completed`, subscription lifecycle) update it between auths. Hosted Checkout and Billing Portal only — no custom payment UI, no card data ever touches this worker.

## [D] Governance split: internal vs external, external served by `docs(query)`

External docs are user-facing and are served verbatim per the P0004 docs-proxy convention; they teach user and model alike. Internal docs are rationale and architecture. Transparency on pricing mechanics is a product decision, not an accident.

## [C] Vodka compliance is a standing constraint

Tier numbers, quota policy, and product copy live only in `governance/` and are fetched at runtime. State lives in D1/Durable Objects. A tier number in worker code is a bug. SPEC.md carries the P0006 enumerations.

## [L] Token-broker tiering is price discrimination, not cost recovery

Minting costs ~nothing; customer API traffic rides their own installation's GitHub rate-limit bucket (5,000–12,500 req/hr, isolated). The honest framing — and the one we use publicly — is concurrency slots.

## [O] Persona check

First-time vibe coder lives entirely inside the 50-mint bucket, never sees a window. A scaled operator running up to ~50 concurrent agents fits inside Max 20x's 100-token window without reset-cycle gymnastics. The ladder covers both ends.
