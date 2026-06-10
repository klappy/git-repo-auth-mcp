# Quota Transparency

Every user — free bucket through Max 20x — sees the same accounting. Nothing is hidden; the response itself teaches your agent how to manage your quota.

## Fields on every `github_token` response

| Field | Meaning |
|---|---|
| `tier` | Your current tier (`free`, `pro`, `max_5x`, `max_20x`) |
| `remaining` | Mints left — bucket balance on free, window quota remaining on paid |
| `window_reset_at` | ISO timestamp when the current 5-hour window resets (paid tiers; absent on free) |
| `weekly_remaining` | Mints left under the weekly backstop (paid tiers) |
| `cached` | `true` when this response reused a live token — no quota was spent |

## Fields on a quota-exceeded failure

| Field | Meaning |
|---|---|
| `limit_hit` | `bucket_empty`, `window`, or `weekly` |
| `window_reset_at` | When minting becomes possible again (window/weekly) |
| `upgrade_url` | Checkout link for the next tier |

## Guidance for agents

- Check `cached` before worrying: reusing a token costs nothing, so prefer the same scope over re-scoping when both work.
- When `remaining` is low, batch work into fewer concurrent sessions rather than minting per task.
- On `bucket_empty`, surface the upgrade decision to your human — do not retry. The bucket does not refill.
- On `window`, the honest move is to wait for `window_reset_at` or tell your human that more concurrency requires the next tier.
