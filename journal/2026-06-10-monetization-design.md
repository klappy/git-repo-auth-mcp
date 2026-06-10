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
