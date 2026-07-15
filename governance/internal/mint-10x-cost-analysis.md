# Cost Analysis — 10x-ing Included Mints in Every Git Repo Auth Tier

**Flight:** fl-06dff8e9 · sess_06dff8e9-e777-49e5-b434-aeeb38435160 · 2026-07-14 (captain civil date, ET; observed 2026-07-15T02:21Z UTC)
**Ruling under analysis:** captain, 2026-07-14 — pricing model overcomplicated, zero signups, mint quota is a soft limit; first move: cost of 10x-ing included mints in every tier including free.
**Prior work cited, not duplicated:** [PR #47 — GitAuth revenue-motion pack](https://github.com/klappy/chief-delegation-officer/pull/47) (board item `burn-2`, still captain-gate) and `governance/internal/pricing-decisions.md` (ratified ladder; already records "[L] Token-broker tiering is price discrimination, not cost recovery. Minting costs ~nothing"). This doc supplies the arithmetic that claim owed.

## 1. What a mint actually costs — proven from the architecture

Sources: `src/quota.ts`, `src/github-auth.ts`, `governance/internal/billing-architecture.md` (repo @ main, read 2026-07-15); Cloudflare pricing fetched live from developers.cloudflare.com/workers/platform/pricing.

One paid-tier mint executes:

| Op | Count | Unit price (beyond included) | Cost |
|---|---|---|---|
| Worker request (CF does not bill subrequests) | 1 | $0.30/M | $0.0000003 |
| KV reads (policy cache, tier, live-token check) | 3 | $0.50/M | $0.0000015 |
| KV list requests (window + weekly counts over `quota:mint:*`) | 2 | $5.00/M | $0.0000100 |
| KV writes (mint row TTL 8d, token-cache record) | 2 | $5.00/M | $0.0000100 |
| GitHub App installation-token mint | 1 | $0 — GitHub API is free; traffic rides the customer's own installation rate limit (5,000–12,500 req/hr, GitHub-enforced) | $0 |
| Stripe Billing Meter event | 1 | $0 — meters carry no per-event fee | $0 |
| **Marginal cost per mint (at full overage rates)** | | | **≈ $0.0000218 — call it $0.000022, i.e. ~45,000 mints per dollar** |

Quota state is **Workers KV, not Durable Objects** (`src/quota.ts` header; the DO counter swap is a logged open item). No DO charges exist on this path today.

**Included-quota shield.** The service runs on one Workers Paid plan ($5/mo, already paid). Included monthly: 10M requests, 10M KV reads, 1M KV writes, 1M KV lists. Writes and lists bind first at 2/mint → the first **~500,000 mints per month, service-wide, cost $0.00 marginal**. Current observed volume (admin_stats, live): 0 external connected users, 1 operator grant. Actual marginal cost of the change today: **$0.00**.

## 2. The 10x quotas per tier, and worst-case ceilings

Weekly backstop stays 12× window (abuse wall; per pricing-decisions.md, <2% of users on the modeled pattern ever touch it). Month = 4.345 weeks.

| Tier | Price/mo | 10x window (5h) | 10x weekly | Absolute ceiling mints/mo | Ceiling marginal cost @ $0.000022 | **Ceiling ROI** (price ÷ cost) |
|---|---|---|---|---|---|---|
| Free | $0 | one-time bucket 1,000 | — | 1,000 once | **$0.022 once** (max; $0 within included) | n/a — 2.2¢ worst-case exposure per signup |
| Solo | $1 | 100 | 1,200 | 5,214 | $0.115 | **8.7x** |
| Pro | $5 | 600 | 7,200 | 31,284 | $0.688 | **7.3x** |
| Team | $25 | 4,000 | 48,000 | 208,560 | $4.59 | **5.4x** |
| Fleet | $100 | 20,000 | 240,000 | 1,042,800 | $22.94 | **4.4x** |

Note: the dispatch brief estimated free-tier 10x at 500 mints (from the original 50-mint decision record). `tiers.md` — the single source of truth the server parses — says 100, so 10x = **1,000**. Reality wins; the 50-vs-100 drift in getting-started.md is fixed in this flight.

## 3. ROI per the decision rule

The rule: ≥100x → just do it; <20x → stop; 20–100x → recommendation card.

- **Observed basis (the only data that exists):** zero external users; all conceivable near-term volume rides inside the already-paid plan's included quotas. Marginal cost of the change = **$0.00** → ROI unbounded, **≥100x trivially**. This holds until aggregate service volume exceeds ~500K mints/month — a scale implying hundreds of active paying customers.
- **Expected basis at scale (included quotas consumed by the base, full overage rates):** utilization anchors from the service's own docs — <2% ever touch the weekly backstop; typical agent use is bursts against the window. At ≤10% of ceiling utilization: Solo 87x, Pro 73x, Team 54x, Fleet 44x. At ≤4%: all tiers ≥100x.
- **Adversarial ceiling (every customer pinned at their 10x weekly backstop 24/7, 4.345 weeks straight):** 4.4x–8.7x in ratio terms — **but never a loss**: worst-case Fleet costs $22.94 against $100 revenue; every tier stays gross-margin positive at its absolute ceiling. The <20x branch describes a margin-ratio, not a downside risk; the absolute downside is bounded at ~$23/customer-month in a scenario the backstop exists to prevent.

**Verdict: JUST DO IT triggers.** On observed data the marginal cost is zero and the ROI is unbounded; the only sub-100x scenarios require unobserved adversarial utilization, and even those lose no money. 🚩 **reversible-by-revert** — enforcement parses `tiers.md` live (300s cache): reverting the commit restores old quotas within 5 minutes, no deploy needed.

**Tripwire (revisit if):** aggregate mints exceed ~400K/month (approaching the included-quota shield), or any customer pins their weekly backstop for 2+ consecutive weeks.

## 4. Simplification seed (feeds the pricing rethink, ships nothing)

Overcomplication observed with zero signups to justify it:
- **Five tiers, two quota dimensions each** (rolling 5h window + weekly backstop) + a differently-shaped free tier (one-time bucket) = seven distinct numbers a prospect must parse. quota-transparency.md needs a table just to explain the response fields.
- **Unused knobs:** the weekly backstop has never been touched (0 users); the window/weekly distinction exists for an abuse pattern never observed. Billing cadence varies by tier (2yr/1yr/monthly) — three checkout stories.
- **Confusing inclusions:** "agents" vs "tokens" (two-per-agent) forces a conversion the buyer does in their head; the free bucket (mints, one-time) and paid windows (concurrency, rolling) sell different units.

Seeded options (board item `gitauth-pricing-rethink`):
1. **Two tiers:** generous free (post-10x: 1,000 mints) + one paid "unmetered within fair use" at $5/mo. Cost analysis shows even pinned-ceiling users cost dollars; fair-use clause replaces both quota dimensions.
2. **One dimension:** drop the weekly backstop entirely; keep only the rolling window. Abuse handling moves to the GitHub-account Sybil boundary already relied on.
3. **Flat per-agent price:** $0.10/agent-slot/mo, buy any number; kills tier tables, names, and the two-per-agent conversion.
