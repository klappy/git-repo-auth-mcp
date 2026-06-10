# Journal — 2026-06-10 — Monetization design session

Voice session, captain + first officer. Outcome: pricing model locked, governance written, build scope defined. Ten DOLCHEO artifacts encoded (full text in `governance/internal/pricing-decisions.md`); this entry carries the narrative and the process learnings.

## Arc

Started as "what would it take to add Stripe + GitHub linking." Researched Claude's dual-window limit pattern and GitHub App token physics (per-installation rate isolation makes tiering pure price discrimination). Iterated free-tier shape live: decay model proposed → captain corrected it — the post-burst trickle is *worse than nothing* — landed on a one-time 50-mint bucket with a hard stop. Reframed paid tiers from mint volume to **minted concurrency** per rolling 5-hour window (captain's insight: tokens ≤1hr means mints ≈ concurrent agents). Persona check passed both ends of the ladder. Challenge (planning mode) surfaced P0004 docs-proxy — onboarding becomes a `docs` tool, not a new mechanism — and prompt-over-code, which made the whole policy layer a set of runtime-fetched documents.

## [L] Process learning (E0010 — to the debrief, no blame, no repeat)

Two planning-stage identity claims died on contact with the repo. Planning assumed multi-tenant identity needed building (proposed `workers-oauth-provider`); challenge then surfaced the 2026-05-16 Supabase middleware handoff and the plan pivoted to "reuse that." The clone showed **both were stale**: the repo already ships per-user OAuth 2.1 + GitHub login + per-grant installation binding — identity was done. The miss: neither the first officer nor the challenge checked the repo's actual state before encoding an identity decision. **Reality is sovereign; a decision about a codebase encoded before observing the codebase is a claim without evidence.** Rule going forward: clone/inspect before encoding any decision that names what a repo lacks.

## [O-open] Open items

- Tier prices (TBD in tiers.md — captain's call, Stripe products blocked on it)
- D1 vs Durable Objects for quota state — decide at preflight per borrow-evaluation (6B rows for Stripe SDK + storage choice)
- Free-bucket expiry — deferred, doc-editable later
- Whether `docs` proxies live from the repo or from a bundled snapshot

## Disposition

Governance PR opened for captain review. Build follows in a separate execution against `governance/SPEC.md`, validated with a context break per `verification-requires-fresh-context`.

## Addendum — same day, build executed in isolation

Captain's call: don't wait on shared klappy.dev billing rails; ship metering self-contained in this repo. Built on the same branch:

- `src/quota.ts` — policy parsed from `governance/external/tiers.md` at runtime (live → bundled snapshot → fail loud, per core-governance-baseline; `governance_source` declared on every decision). KV accounting: free bucket, append-only mint log, live-token scope records (same-scope re-mints are cache hits, uncounted). Sliding 5-hour window; `tiers.md` wording aligned to match (doc wins).
- `src/billing.ts` — Stripe with zero SDK (borrow-evaluation: the substrate is Stripe's HTTP API; the SDK is ballast in a worker). WebCrypto webhook signature verification with timing-safe compare and 5-minute tolerance; idempotent tier mirroring into KV; meter events via fetch in waitUntil — metering is analytics, never availability.
- `src/docs.ts` + `docs` MCP tool — governance/external served verbatim, live → bundled (P0004).
- `src/mcp-api.ts` — quota gate around the mint, transparency fields (`quota.{tier, remaining, window_reset_at, weekly_remaining, cached, governance_source}`), quota-exceeded wall with `upgrade_url`. v0.3.0.
- Enforcement feature-flagged (`QUOTA_ENFORCE`, ships "false"): accounting observes first, per build order.
- Evidence: `tsc --noEmit` clean; 9/9 vitest (bundled-doc parse asserts 50/5-60/25-300/100-1200 so doc drift fails CI; scopeKey order-insensitivity; webhook signature accept/reject/expiry); `wrangler deploy --dry-run` bundles with the Text rule.

Not done here, deliberately: Stripe products/prices (blocked on captain pricing), webhook endpoint registration in the Stripe dashboard, production deploy. Release follows klappy://canon/constraints/release-validation-gate — validation needs a fresh context, not this session's smoke.

## Addendum — customer zero feedback, same day

First prospective customer misread the legacy live page: big "$24 / two years" parsed as $24/month (the actual $1/mo fine print went unseen — happily, he wanted it anyway). Encoded as the hero-number rule in pricing-decisions.md: the big figure on any pricing surface is always the per-month price; everything else is fine print. Branch homepage updated to comply ($0/month heroes; the 50-mint bucket demoted from hero slot to fine print). The misread page stays live until PR #3 merges.

## Addendum — Stripe live objects created via connector, same day

Captain connected the Stripe MCP; objects created directly in live mode (Covenynt Ventures LLC), no keys in chat. Products + prices: Solo $24/2yr (price_1TgrOHPHZ1kOt0d4ROZOt0rZ), Pro $60/yr (price_1TgrONPHZ1kOt0d4XvuAPXsh), Team $25/mo (price_1TgrOUPHZ1kOt0d4ki14AGCo), Fleet $100/mo (price_1TgrOcPHZ1kOt0d4CtxsK6QA). Payment links live and wired to homepage cards; STRIPE_PRICE_MAP + STRIPE_UPGRADE_URL in wrangler vars.

Remaining, operator-side (dashboard, keeps secrets out of chat): Billing Meter `git_token_mint` (connector lacks the endpoint; analytics-only since tiers are flat), webhook endpoint -> https://gitauth.klappy.dev/webhooks/stripe (events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted) then `wrangler secret put STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY`. Then deploy.

## [O-open → CLOSED same day] Binding gap on homepage purchases

Closed by the /buy/{tier} route: buy buttons hit the worker, which runs the existing GitHub login dance (tagged state, same /callback, user token used once and discarded) and redirects to the tier's payment link with client_reference_id={login}. Every purchase path now binds automatically; quota.ts no longer mangles the upgrade URL with a query-on-fragment. Payment links live in STRIPE_PAYMENT_LINKS (tier → URL), validated https-only.
