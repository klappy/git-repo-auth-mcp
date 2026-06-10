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

## [L] Hero-number rule: the big figure is always the per-month price

Learned from customer zero (2026-06-10): the legacy homepage showed a large "$24" with "for two years" in fine print, and he read it as $24/month — missing that the real deal was $1/month. People parse the biggest number on a pricing card as the monthly price regardless of qualifiers. Standing rule for every pricing surface (homepage, checkout, docs): the hero number is the per-month figure; billing periods, totals, and unit counts are fine print. When tier prices land, cards read "$X / month" big, with any annual total small ("billed annually, $Y/yr"). Counts of things that are not prices (mints, tokens) never take the hero slot.

## [D] Launch prices: linear with concurrency — Pro $5/mo, Max 5x $25/mo, Max 20x $100/mo

The tier names state the multiplier, so the prices honor it: 5x the window quota costs 5x the dollars, 20x costs 20x. Self-explaining, impossible to feel tricked by, and consistent with the public framing that limits are concurrency slots, not cost recovery. Evidence for the ceiling: customer zero wanted the product while believing it cost $24/month — Max 5x at $25 sits exactly on the demonstrated willingness-to-pay, with Pro at $5 as the easy yes. Prices live in governance/external/tiers.md (Price column); homepage and docs tool render from it, so a repricing is a one-line doc edit. Ratified by captain review of this PR.

## [D] Amendment (captain): Solo replaces Pro — the legacy $1/mo deal is the entry paid tier

Solo: $1/month, billed $24 per two years, with the 5-tokens-per-5-hour-window quota (and the 60/week backstop). It is the deal customer zero responded to, restored deliberately: an irresistible entry price that makes the paid decision trivial, while Max 5x ($25) and Max 20x ($100) carry the revenue and keep their honest names — 5x and 20x Solo's concurrency. Pricing is no longer price-linear and that's accepted; Solo is the hook, not the margin. Five per window means five whenever you like: all in the first hour, or one an hour for five hours.

## [D] Final ladder (ratified): Solo / Pro / Team / Fleet — named for agentic concurrency, discounted per slot as you climb

Solo 5 @ $1/mo ($24 per 2 years), Pro 30 @ $5, Team 200 @ $25, Fleet 1,000 @ $100; weekly backstops at 12x window. Per-slot price falls monotonically ($0.20 / $0.167 / $0.125 / $0.10) so scale is rewarded, never punished. Multiplier names (Max 5x/20x) retired: they had drifted to multiplying *price*, which is anti-marketing. Tier names now answer the captain's framing question — "how big is your agentic concurrency?" — and every tier is one human, no seats; Team and Fleet are teams and fleets of agents. KV accounting is sufficient through Team; a Fleet customer at full tilt triggers the Durable Object counter swap already logged as an open item (interface unchanged).
