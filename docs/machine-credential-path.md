# Machine-Credential Path — Static Service Key for the ARS Worker

**Status:** shipped (v1-interim, single-tenant by rule).
**Ruling:** captain, 2026-07-14 ET — board item `ars-gitauth-mint-credential`,
option 1: static service key, ARS_CAPABILITY_KEY pattern, bound to one
installation (the klappy-bound one).
**Owed for v2:** per-tenant mint credentials (tenant-bound installations,
keys encrypted in the tenant DO) per
`klappy://ars/policy/ars-v2-multitenancy-policy` §13 — this key is
EXPLICITLY not a pattern tenants share.

## What changed

`/mcp` was OAuth-only: every bearer had to be an OAuth access token minted by
`@cloudflare/workers-oauth-provider` after a human GitHub login. That left no
durable credential the ARS worker could hold as `GIT_REPO_AUTH_TOKEN`, so the
container lane's git provisioning (`src/runtime/gitauth.js` in
`klappy/agent-role-service`) degraded fail-soft on every run.

Now, before the OAuth provider sees a `/mcp` request, the worker checks for
ONE machine caller (`src/service-auth.ts`):

- Bearer compared constant-time against the `ARS_SERVICE_KEY` secret
  (the ARS_CAPABILITY_KEY pattern: static key, Bearer, constant-time compare).
- Match → the request is served by the same `McpApiHandler`, same quota and
  metering, with grant props pinned to the installation owned by
  `ARS_SERVICE_ACCOUNT` (var, default `klappy`), resolved live via GitHub's
  `/app/installations` and cached 10 minutes per isolate.
- No key configured → the path does not exist (today's OAuth-only behavior).
- Wrong key → falls through to the provider's normal invalid-token rejection;
  no oracle distinguishes "path off" from "bad key".

## Provisioning — deploy-time rotation, no human custody

`scripts/provision-service-key.mjs` runs as the tail of `npm run deploy`
inside Workers Builds (the git-hook deploy), spending the build's own
`CLOUDFLARE_API_TOKEN`:

1. generates a fresh 256-bit key (never printed, never on disk),
2. `PUT`s it as secret `ARS_SERVICE_KEY` on `git-repo-auth-mcp`,
3. `PUT`s it as secret `GIT_REPO_AUTH_TOKEN` on the `ars` worker.

Storage location: **Cloudflare Worker secrets on those two workers — nowhere
else.** Every main deploy rotates the key on both sides in one build; no
human ever knows its value. Non-main branches and local runs skip cleanly.

## Blast radius & reversibility

- The key mints ≤1h installation tokens inside the klappy installation only;
  GitHub enforces the wall. Quota/metering apply as login `klappy`.
- 🚩 Reversible by revert: reverting this PR removes the path at next deploy;
  deleting the `ARS_SERVICE_KEY` secret disables it immediately without a
  deploy.
- Known seam: rotation is not atomic across the two PUTs; a mint in the
  seconds between them can 401 once. ARS is fail-soft and the next run heals.

## Tests

`test/service-auth.test.ts` (12 cases): constant-time compare, bearer
parsing, key-off/wrong-key/whitespace behavior, installation picking.
Full battery: 60 passed, typecheck clean.
