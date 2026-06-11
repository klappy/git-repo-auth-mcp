# Operator Observability — User & Conversion Stats

*Draft for operator review. Not yet ratified. Lives at `governance/internal/operator-observability.md` once approved; served live by the worker like all governance.*

## Why this exists

"How many users do we have?" was unanswerable without shelling into wrangler (debrief, 2026-06-11). Counts must be discoverable through the MCP itself, by the operator, defined here and computed live — never hardcoded in handlers.

## Definitions

| Term | Definition | Source of truth |
|---|---|---|
| Connected user | A GitHub login with a grant/user record in KV | KV (persists until disconnect/uninstall) |
| Active user | Distinct logins with ≥1 mint in the trailing 8 days | KV mint log (8-day retention bounds this window) |
| Paid user | Login with tier ≠ free | KV for tier; Stripe is source of truth for subscription status |
| Crude conversion ratio | paid ÷ connected | Derived |
| Staged funnel ratios | first mint → bucket empty → wall hit → buy click → paid | Future: funnel events (separate decision, pending privacy posture) |

## Surface

An operator-only MCP tool, `admin_stats`:

- Visible and callable only when the authenticated login matches the operator login (configured, not hardcoded).
- Returns **aggregate counts only** — connected, active, paid, and the crude ratio. No logins, no per-user rows, nothing reversible.
- The tool description names this document, so the capability is self-discoverable by any agent connected as the operator.

## Privacy posture

This adds **no stored data**. Counts are computed at request time from records the privacy policy already enumerates. Aggregates leave the worker; identities do not. Therefore no privacy-policy amendment is required. If per-user funnel events are ever added, that is a separate decision requiring a policy amendment with a new effective date.

## Implementation constraints

- Counts via KV `list` with key prefix at request time. Acceptable below ~1,000 keys; revisit alongside the already-logged Durable Object counter swap.
- Paid count cross-checks Stripe active subscriptions; disagreement between KV tier and Stripe is surfaced in the response, not silently reconciled.
- Definitions above are the contract. Code reads them as the spec; changing a definition means changing this document first.

## Open questions (parked, not blocking)

1. Funnel events and cohort retention — blocked on the privacy trade the operator hasn't called yet (per-user hashed rows vs. aggregate counters).
2. Whether `admin_stats` should also expose mint-volume totals for capacity planning.
