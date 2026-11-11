# Review — Interim klappy-only lockdown (2026-09-05)

Captain ruling 2026-09-05: "If we lock it down to just Klappy user, we stop the biggest
risk." This is the interim plug; the real fix is the ruled v1.0.0 user-token shape
(not started here).

## Incident this responds to

`klappy/kitchen` rail item `rail/2-cooking/2026-09-01-gitauth-installation-escalation/TICKET.md`
(mechanism §2, finding, ruling 🅰) — not present in this repo's clone (it lives in a
separate `klappy/kitchen` repository, and `api.github.com` is unreachable from this
sandbox, so the ticket text itself was not fetched live). Substance, as briefed: one
shared repository let an outside GitHub login bind the whole `klappy` App installation
(103 repos, `contents:write`). Root cause: the bridge authenticates with a GitHub user
token but authorizes with an installation token, and nothing bridged the two — any
login that could see one shared installation via `GET /user/installations` could bind
the entire installation, not just the shared repo.

## What changed

One predicate, `isOperatorOwned(env, login)` (`src/stats.ts`), reused at every place a
grant can be bound or a token can be minted. It returns whether `login` is in the
already-existing operator-owned set — `OPERATOR_LOGIN` plus any configured
`TEST_LOGINS` (`governance/internal/operator-observability.md`'s definition, not a
second copy of the config). Fails closed: an unconfigured `OPERATOR_LOGIN` allows no
one.

Three call sites:

1. **`src/github-auth.ts`, `/callback`.** Refuses immediately after resolving the
   GitHub login (skipping the buy-tier flow, which never binds an installation) —
   before `GET /user/installations` is even called, so a non-operator login never
   sees the install-app redirect or the account picker.
2. **`src/github-auth.ts`, `completeFor`.** The single function that actually calls
   `OAUTH_PROVIDER.completeAuthorization` — reached from `/callback`'s one-installation
   path, `/select` (POST, picker), and `/setup` (post-install resume) alike. Gating here
   is the authoritative, last-line-of-defense check: even a leaked/guessed pending id
   POSTed straight to `/select`, or a `/setup` resume from a pending record created
   before this deploy, cannot bind.
3. **`src/mcp-api.ts`, the `github_token` tool handler.** Refuses before any quota
   check or mint call. This is what kills the outside logins' *existing* grants: their
   KV/props records still have `installationId` and `login` set from before the
   lockdown, but the mint reads `props.login` and refuses it outright — no KV write,
   delete, or migration needed.

Refusals are explicit, not silent: `/callback` and `completeFor` return a 403 page
naming the reason; the mint returns `{"error":"access_restricted", "detail": "..."}`
with `isError: true`. No tool description or behavior changed beyond one added
sentence on `github_token`'s description noting the lockdown.

The ARS machine-credential path (`src/service-auth.ts`) is untouched — it still pins
`props.login` to `ARS_SERVICE_ACCOUNT` (default `"klappy"`), which is operator-owned
under the deployed config (`wrangler.jsonc`'s `OPERATOR_LOGIN: "klappy"`), so it passes
the same mint gate every other caller now goes through.

## How it was proven

- `npm run typecheck` — clean.
- `npm test` — 67 passed, 9 skipped (pre-existing `test/smoke.live.test.ts`, which needs
  live network and was already skipped before this change), 0 failed.
- `test/lockdown.test.ts` (new): operator login passes; configured `TEST_LOGINS` login
  passes; an outsider login is refused at the callback-equivalent check; an outsider is
  refused at the mint-equivalent check even when constructed with a full `GrantProps`
  object (simulating a pre-existing KV grant) — the gate reads only `login`, so an
  existing grant changes nothing; `OPERATOR_LOGIN` unset fails closed; the ARS default
  service account matches operator-owned under the deployed config.
- `mcp-api.ts` cannot be imported directly under the Node test runner (it transitively
  pulls in `cloudflare:`-scheme modules — the same reason `service-auth.ts` dynamically
  imports it rather than importing it at module scope). Per the repo's existing
  convention (`test/install.test.ts` tests `setupOutcome`, not `github-auth.ts`'s HTTP
  handler), the gate logic is tested as the extracted pure predicate it actually is,
  not by driving the full HTTP/MCP handlers end to end.
- Manual read-through of all three call sites confirms the predicate is evaluated
  before any state-changing action (installation listing, KV pending-record write,
  `completeAuthorization`, or mint) in each.

## What this does NOT fix

- **Registration over-grant.** The underlying mechanism — a user token's
  `/user/installations` visibility being wider than the one repo actually shared with
  them — is untouched. This lockdown just refuses everyone who isn't the operator; it
  does not change what installations a non-operator login can *see*, only whether they
  can *bind* or *mint*. The real fix (ruled v1.0.0 user-token shape, tracked
  separately) is what closes the mechanism itself.
- **Tokens already minted before this deploy.** Any installation token minted for an
  outside login prior to this change lives out its normal ≤1-hour expiry — nothing
  revokes a live token early. The exposure window this closes is *new* mints and *new*
  bindings, from deploy time forward.
- **The `TEST_LOGINS` account(s), if any are configured, are not restricted further** —
  they were already operator-owned by definition (`operator-observability.md`) and stay
  able to connect and mint, same as before this change.
- **v1.0.0 is not started here.** This is explicitly the interim plug per the captain's
  ruling, not the ruled fix.

## Rollback

Revert this commit. All three gates are additive `if` checks around existing logic; no
data shape, KV key, or config field changed, so no migration is needed in either
direction. The docs/changelog changes revert cleanly with it (each carries a dated
supersession note rather than replacing prior text).
