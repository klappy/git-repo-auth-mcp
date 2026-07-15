# Lithos Stream — Flight sess_33183906: gitauth machine-credential path + container-lane proof

Session sess_33183906-837b-42d6-9b22-b153018e0788 · crew/cowork/claude-fable-5 · 2026-07-14 ET (2026-07-15T02:41Z observed)
Item: ars-gitauth-mint-credential · Brief: cowork-dispatch-2026-07-14-gitauth-machine-credential

## Checkpoint 1 — boarding + recon (02:40–02:47Z)
- Operating contract + dispatch-brief-conventions v0.7.0 fetched live; oddkit_preflight passed; governance reachable (oddkit_get/search, ars_policy_get, board_get).
- Flight-class checkin bound to ars-gitauth-mint-credential; lease active.
- Attribution step 0: GET /users/klappy with minted token → id 118073 (read live, not typed from a doc).
- Recon: gitauth /mcp OAuth gate (src/index.ts, mcp-api.ts, types.ts), ARS mint client (agent-role-service src/runtime/gitauth.js — Bearer GIT_REPO_AUTH_TOKEN → tools/call github_token), ARS wrangler secrets conventions.
- Provisioning constraint observed honestly: no crew-reachable Cloudflare worker-secret tool exists in this seat (Cloudflare MCP: KV/D1/R2/workers-read only), and typing key material into dashboards is off-limits. Resolution: deploy-time rotation inside Workers Builds, which already holds CLOUDFLARE_API_TOKEN for wrangler — the deploy IS the provisioning act, and the git-hook deploy is the promote-gate path.

## Checkpoint 2 — execution (02:47–02:52Z)
- src/service-auth.ts: constant-time service-key check; installation pinned to ARS_SERVICE_ACCOUNT (default klappy) resolved live via /app/installations, 10-min isolate cache; served by the same McpApiHandler (same quota/metering, login "klappy").
- src/index.ts hook before the OAuth provider; src/types.ts env docs; scripts/provision-service-key.mjs (rotates ARS_SERVICE_KEY on gitauth + GIT_REPO_AUTH_TOKEN on ars, value never printed); package.json deploy tail.
- test/service-auth.test.ts: 12 cases. Battery: 60 passed / typecheck clean (smoke.live excluded as designed).
- Deliverable: docs/machine-credential-path.md. Foldout: streams/2026-07-14-captain-decisions.foldout.tsv (1 row, relayed ruling).
