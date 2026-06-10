# Tiers and Quotas

> This document is the single source of truth for tier limits. The server reads it; the `docs` tool serves it; what you read here is what the code enforces. If behavior and this document disagree, the document wins and the code has a bug.

## What you are paying for

Concurrency. A minted token lives at most one hour, so "tokens minted per window" is effectively "how many agents can be working on your repos at once." Minting costs the operator almost nothing — your API traffic rides your own GitHub installation's rate limit (5,000–12,500 req/hr, isolated per installation, enforced by GitHub). The tiers price throughput, and we'd rather say that plainly than dress it up.

## The tiers

How big is your agentic concurrency? Every tier is one human, no seats — the team is your agents.

| Tier | Tokens per rolling 5-hour window | Weekly backstop | Price |
|---|---|---|---|
| Free | one-time bucket of **50 mints total** | — | $0 |
| Solo | **5** | 60 | $1/mo ($24 per 2 years) |
| Pro | **30** | 360 | $5/mo ($60 per year) |
| Team | **200** | 2,400 | $25/mo |
| Fleet | **1,000** | 12,000 | $100/mo |

Billing cadence scales with commitment: Solo is $1/mo billed $24 per two years, Pro is $5/mo billed $60 per year, Team and Fleet are month-to-month. Above it, the per-slot price falls as you climb — $0.20 at Solo, $0.167 at Pro, $0.125 at Team, $0.10 at Fleet — so upgrading is always the better deal per agent. No bundling tricks, no "contact sales."

## How the free bucket works

You get 50 mints, once. No windows, no decay, no daily trickle. Use all 50 in an hour or spread them over a month — your call. When the bucket is empty, minting stops and the response tells you how to upgrade. Fifty mints is enough to genuinely feel what it's like to hand an agent your repos; if you burned through them, you already know whether this is worth paying for.

## How paid windows work

- The 5-hour window is **rolling**: each mint counts against you for exactly five hours, then falls off. `window_reset_at` tells you when your next slot frees. Mint your quota in a burst and you wait; spread mints out and you may never notice the window.
- The **weekly backstop** exists for abuse protection. It is set high enough (12× the window quota) that normal use never touches it.
- **Cached tokens are free.** Re-requesting the same scope while a previous token is still alive returns the cached token and does not count as a mint. Retries cost you nothing.

## When you hit a limit

Minting fails with a clear message: which limit you hit, when it resets (`window_reset_at`), and where to upgrade. There is no "request more" queue — the wall is the wall, and the next tier is the answer. Every successful mint also tells you where you stand (see `quota-transparency.md`), so the wall is never a surprise.
