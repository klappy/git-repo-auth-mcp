# Operator Observability — User & Conversion Stats

*Operator-approved 2026-06-11. Served live by the worker like all governance.*

## Why this exists

"How many users do we have?" was unanswerable without shelling into wrangler (debrief, 2026-06-11). Counts must be discoverable through the MCP itself, by the operator, defined here and computed live — never hardcoded in handlers.

## Definitions

| Term | Definition | Source of truth |
|---|---|---|
| Operator-owned grant | A grant whose login is the operator login or a configured test login | Config (`OPERATOR_LOGIN` + `TEST_LOGINS`) — not hardcoded |
| Connected user (net) | A GitHub login with a grant/user record in KV, **excluding operator-owned grants** | KV minus the exclusion set |
| Active user (net) | Distinct **non-operator-owned** logins with ≥1 mint in the trailing 8 days | KV mint log (8-day retention bounds this window) |
| Paid user (net) | **Non-operator-owned** login with tier ≠ free | KV for tier; Stripe is source of truth for subscription status |
| Crude conversion ratio | paid (net) ÷ connected (net) | Derived |
| Staged funnel ratios | first mint → bucket empty → wall hit → buy click → paid | Future: funnel events (separate decision, pending privacy posture) |

The headline counts (`connected_users`, `active_users_8d`, `paid_users`) are **net of operator-owned grants** — they answer "how much external adoption is there." Each is reported alongside its raw counterpart (`*_raw`) and the netting amount (`operator_owned_grants`), so operator-owned grants stay observable but never inflate the headline.

## Operator-owned grants

The operator dogfoods the service with their own login and at least one dedicated
test account. These are real KV records, but they are not adoption. Counting them
as connected/active/paid produces a recurring false positive: a reader who
remembers the baseline as "one user" misreads the next glance as an outside user
arriving. (This misread happened more than once before the exclusion existed.)

The exclusion set is configured, never hardcoded: `OPERATOR_LOGIN` (already used to
gate `admin_stats` visibility) plus `TEST_LOGINS` (a comma-separated list of
additional operator-owned logins). Any grant whose login is in this set is
operator-owned and is netted out of the headline counts.

`admin_stats` reports net as the headline and includes raw alongside, e.g. when the
only two grants are the operator and one test account:

```
connected_users: 0          # net — external adoption
connected_users_raw: 2      # includes operator-owned
operator_owned_grants: 2    # the netting amount
active_users_8d / _raw, paid_users / _raw  follow the same pattern
```

This keeps the test grant honest (visible, not hidden) while preventing it from
ever reading as a stranger.

## Surface

An operator-only MCP tool, `admin_stats`:

- Visible and callable only when the authenticated login matches the operator login (configured, not hardcoded).
- Returns **aggregate counts only** — connected, active, paid, and the crude ratio. No logins, no per-user rows, nothing reversible.
- The tool description names this document, so the capability is self-discoverable by any agent connected as the operator.

## Tool token footer (docs tool)

Canon draft `klappy://canon/constraints/tool-token-footer`: every content-producing tool response carries `tokens: {source, returned, ratio, tokenizer}`, computed at the tool's door. In this service only `docs` produces content — `github_token` mints credentials and `admin_stats` returns aggregates — so only `docs` carries it, as `_meta.tokens` on the tools/call result (never in the content text; same placement as cartographer).

- `source` — cl100k_base tokens of the whole governance documents chosen for the answer (up to two).
- `returned` — cl100k_base tokens of the content block actually sent (documents plus a one-line header each and separators), so the ratio sits just above 1.
- `ratio` — returned/source, 4 decimals; null when source is 0.
- Telemetry count: one Workers Logs event per call, `{"event":"tool_tokens","tool":"docs","tokens_source":…,"tokens_returned":…,"ratio":…,"tokenizer":"cl100k_base"}`. Numbers and tool name only — no query, no document text, no login. This service has no Analytics Engine dataset; the log event is the metered count until one is bound.

## Privacy posture

This adds **no stored data**. Counts are computed at request time from records the privacy policy already enumerates. Aggregates leave the worker; identities do not. Therefore no privacy-policy amendment is required. If per-user funnel events are ever added, that is a separate decision requiring a policy amendment with a new effective date.

## Implementation constraints

- Counts via KV `list` with key prefix at request time. Acceptable below ~1,000 keys; revisit alongside the already-logged Durable Object counter swap.
- Headline counts are net of the operator-owned exclusion set (`OPERATOR_LOGIN` + `TEST_LOGINS`); raw counts and the exclusion amount are included alongside, never instead. The exclusion set is config, read at request time like every other definition here.
- Paid count cross-checks Stripe active subscriptions against the **raw** paid count — the operator's own dogfooding subscription is a real Stripe subscription, so comparing the net paid count against Stripe would manufacture a permanent false discrepancy. Disagreement is surfaced in the response, not silently reconciled.
- Definitions above are the contract. Code reads them as the spec; changing a definition means changing this document first.

## Open questions (parked, not blocking)

1. Funnel events and cohort retention — blocked on the privacy trade the operator hasn't called yet (per-user hashed rows vs. aggregate counters).
2. Whether `admin_stats` should also expose mint-volume totals for capacity planning.
