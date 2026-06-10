# Billing Architecture

## Components

- **Stripe** (source of truth): one Product per paid tier, recurring Prices, a Billing Meter receiving one event per counted mint, hosted Checkout for upgrade, hosted Billing Portal for self-service. This worker never renders payment UI and never sees card data.
- **Worker state** (D1 or Durable Objects — decide at preflight against current platform guidance):
  - `users`: `gh_user_id` → `stripe_customer_id`, `tier`, `subscription_status`, `bucket_remaining`
  - `mints`: append-only `(gh_user_id, minted_at, scope_hash, cached)` — window and weekly counts are queries over this, not separate counters that can drift
  - Installation binding already lives in the existing OAuth grant (shipped); billing state attaches to the same `gh_user_id`.
- **Token cache**: `scope_hash` → live token + expiry, per grant. Serving from cache sets `cached: true` and writes a `cached` row (for analytics) without counting against quota.

## Flows

**Mint** (the only hot path): resolve grant → load tier + counts → enforce (bucket / window / weekly, in that order) → mint via existing `@octokit/auth-app` path → record mint row → fire Stripe meter event (non-blocking; queue + retry, never fail a mint on meter latency) → respond with token + transparency fields.

**Upgrade**: quota-exceeded response carries `upgrade_url` (Checkout). `checkout.session.completed` webhook sets tier. **Webhook hardening:** verify signatures, treat events as at-least-once (idempotency keys), and re-sync subscription status from the Stripe API at every auth so a missed webhook degrades to "stale until next login," never "wrong forever."

**Downgrade/cancel**: subscription lifecycle webhooks flip tier at period end. A canceled paid user does not regain a free bucket — the bucket is once per GitHub account, ever.

## Enforcement notes

- Quota policy values are parsed from `governance/external/tiers.md` at runtime (cached with the worker's usual doc cache). Code knows *how* to enforce; the doc says *what*.
- Free-bucket accounting is per GitHub account (`gh_user_id`), the abuse boundary the captain identified: GitHub account creation cost is our Sybil resistance.
- Pre-existing grants from before billing ship are grandfathered into the free bucket at first post-deploy mint.

## Build order (execution scope, after this PR)

1. State schema + mint-row accounting (no enforcement — observe first)
2. Transparency fields on responses (ships value immediately, zero risk)
3. Enforcement reading tiers.md (feature-flagged)
4. Stripe: products, meter, checkout, webhooks, auth-time re-sync
5. `docs(query)` tool serving `governance/external/`
6. Release per `klappy://canon/constraints/release-validation-gate` — same-session smoke is not validation
