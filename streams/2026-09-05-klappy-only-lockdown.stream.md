# Lithos Stream — Flight: gitauth klappy-only lockdown (interim security plug)

Seat: Otto (infra) · Dispatcher: CoS door · 2026-09-05
Item: gitauth-klappy-only-lockdown · Brief: captain ruling 2026-09-05 ("lock it down to
just Klappy user, we stop the biggest risk")

## Checkpoint 1 — boarding + recon

- Repo already cloned at main `e3e2270` (git-repo-auth[bot] merge of PR #50). Read
  `src/github-auth.ts` (`/callback`, `/select`, `completeFor`), `src/install.ts`
  (`setupOutcome`), `src/mcp-api.ts` (`github_token` mint), `src/service-auth.ts` (ARS
  path), `governance/internal/operator-observability.md` (OPERATOR_LOGIN/TEST_LOGINS
  definition), `wrangler.jsonc` (confirms `OPERATOR_LOGIN: "klappy"` live), `src/stats.ts`
  (existing `operatorOwnedLogins`/`isOperator`).
- **Blocker observed, not held on:** the incident ticket
  (`klappy/kitchen rail/2-cooking/2026-09-01-gitauth-installation-escalation/TICKET.md`)
  is not present in this repo's clone — it lives in the separate `klappy/kitchen` repo,
  and `api.github.com` is unreachable from this container (as the brief anticipated).
  Flew on the brief's own summary of the finding instead of holding.
- **Blocker observed on attribution:** `git log --all` shows exactly one commit, authored
  by `git-repo-auth[bot]`; no `klappy` identity (numeric id or otherwise) appears
  anywhere in git history. `governance/external/identity-and-attribution.md`'s sanctioned
  recipe requires `GET /users/{login}` to resolve the id live, which is also unreachable
  here. A numeric id (118073) does appear in a prior stream doc
  (`streams/2026-07-14-machine-credential.stream.md`), but the brief explicitly says
  "never type an id from a document" — and that same stream records a prior agent
  refusing to inline the klappy attribution email as identity-spoofing for exactly this
  reason. Followed that precedent: commits in this flight are NOT stamped with a klappy
  noreply address. Named blocker carried to the report; branch pushed under the
  container's own git identity instead.

## Checkpoint 2 — execution

- `src/stats.ts`: exported the existing `operatorOwnedLogins` (was module-private) and
  added `isOperatorOwned(env, login)` — one predicate, reusing the OPERATOR_LOGIN +
  TEST_LOGINS config `operator-observability.md` already defines, not a second copy.
  Fails closed when `OPERATOR_LOGIN` is unset.
- `src/github-auth.ts`: gate at two points — early refusal in `/callback` right after
  resolving the GitHub login (skipping the buy-tier flow, which doesn't bind), and a
  second, authoritative gate inside `completeFor` (the one function backing
  `/callback`'s single-installation path, `/select`, and `/setup`). Both return an
  explicit 403 page (`lockdownRefusal`), never a silent 404.
- `src/mcp-api.ts`: gate as the first statement inside the `github_token` tool handler,
  before any quota check or mint call — refuses with
  `{"error":"access_restricted", ...}` / `isError: true`. One sentence added to the
  tool's description noting the lockdown. `admin_stats` (already operator-gated via
  `isOperator`, a different, stricter predicate — no TEST_LOGINS) left untouched.
  `src/service-auth.ts` (ARS path) left untouched; it passes the new mint gate under the
  deployed config because `ARS_SERVICE_ACCOUNT` defaults to `"klappy"`, which is
  `OPERATOR_LOGIN`.
- `test/lockdown.test.ts` (new, 8 cases): operator passes, TEST_LOGINS passes, outsider
  refused (callback-equivalent and mint-equivalent, the latter with a full `GrantProps`
  object standing in for a pre-existing KV grant), fail-closed when unconfigured, ARS
  default-account compatibility. `mcp-api.ts` itself is not Node-importable (transitive
  `cloudflare:`-scheme deps, same reason `service-auth.ts` dynamically imports it) — same
  convention as `test/install.test.ts` testing `setupOutcome` directly rather than the
  HTTP handler, so the gate is tested as the extracted predicate.
- Docs in the same PR: `CHANGELOG.md` (Unreleased → Security, dated, pointer to the
  incident path, no collaborator repo named), `README.md` + 
  `governance/external/getting-started.md` + `docs/troubleshooting.md` (dated
  supersession notes, old text retained). Captain-voice pages (`public/*.html`, privacy
  policy, ToS) untouched — confirmed via `git status` before commit.
- `npm run typecheck` — clean. `npm test` — 67 passed, 9 skipped (pre-existing
  `test/smoke.live.test.ts`, unaffected), 0 failed.

## Checkpoint 3 — validation, push, park

- Spawned a fresh subagent to validate the branch independently against this brief:
  re-run tests, grep for any captain-voice page diff, confirm refusal wording is
  explicit (no silent 404s). Verdict and findings folded into the flight report.
- Branch `dish/2026-09-05-gitauth-klappy-only-lockdown` pushed via git protocol (no
  REST). PR not opened (REST unreachable from this seat, and out of scope for this
  seat per the brief) — the seat opens it.
- Flight lands on completion with two named blockers (ticket text not locally
  fetchable; klappy attribution id unresolvable) carried into the report, neither of
  which blocked the code/tests/docs deliverable.
