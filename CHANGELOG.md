# Changelog

## v0.3.0 — Unreleased (Connectors Directory phases 1–2)

### Breaking

- **`github_token` without `permissions` now mints read-only** (`{"contents":"read"}`). Connections that relied on a bare call minting the App's full grant must now request write by name: `{"permissions":{"contents":"write","pull_requests":"write"}}` — same single call, same cost. Rationale and the user-side teaching live in `governance/external/getting-started.md` ("Read first, write by asking") and `governance/external/prompt-injection-stance.md`.

### Added

- **Added — write verbs `git_put`, `git_move`, `pr_open`.** Server-side writes ride the minted token (mint-scope = write-scope, one named repo). Direct writes to `main` limited to `rail/**` and `journal/**`. Commits attributed to the connected login. One audit row per call, landed or refused; the token is never logged. See `docs/write-verbs.md`.
- **Machine-credential path for `/mcp`** (`src/service-auth.ts`) — a static service key (`ARS_SERVICE_KEY` secret, Bearer, constant-time compare; ARS_CAPABILITY_KEY pattern) lets the ARS worker mint without an OAuth grant, pinned to the `ARS_SERVICE_ACCOUNT` installation (default `klappy`). v1-interim, single-tenant by captain ruling (2026-07-14, board `ars-gitauth-mint-credential`); per-tenant credentials owed for v2 multitenancy. Provisioned by deploy-time rotation (`scripts/provision-service-key.mjs`): every main deploy mints a fresh key and sets Worker secrets on both `git-repo-auth-mcp` and `ars` — no human custody. See `docs/machine-credential-path.md`.
- **`/.well-known/provenance`** — build-asserted deployment provenance (issue #8, phase 1). Returns the commit SHA captured at build time by `scripts/build-info.mjs` (`WORKERS_CI_COMMIT_SHA` → `GITHUB_SHA` → local git → `"unknown"`), with the payload itself stating its limit: chain of custody, not cryptographic proof. Phases 2–3 (reproducible builds, Sigstore cross-checks) tracked in issue #8.
- Tool annotations on `github_token` and `docs` (title, `readOnlyHint`/`destructiveHint` et al.) per Connectors Directory requirements.
- Origin-header validation at the worker edge (`src/origin.ts`): requests bearing an `Origin` must match the deployment host or `ALLOWED_ORIGINS` (new optional env var); absent `Origin` passes. Substrate evaluation in the file header.
- Policy pages served from governance documents (live → bundled): `/privacy`, `/terms`, `/security` (`src/pages.ts`).
- `docs` tool now also serves `privacy-policy.md`, `terms-of-service.md`, and `prompt-injection-stance.md`.
- Governance: operator-approved privacy policy and Terms of Service (no refunds; **prorated, immediate upgrades**; Florida governing law); prompt-injection stance.

### Fixed

- Stale tier-name comment in `src/quota.ts` (now matches `TierId`).

## v0.2.0

- Bridge model: per-user OAuth 2.1 (dynamic client registration, PKCE) binding each grant to the GitHub App installation the user controls; minting scoped per installation. Retired `MCP_AUTH_TOKEN` and `GH_APP_INSTALLATION_ID`.

## v0.1.0

- Initial worker: GitHub App installation-token minting over MCP.
