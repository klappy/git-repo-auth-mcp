# Changelog

## Unreleased

### Security

- **Interim operator-only lockdown (2026-09-05).** New connections are refused for every GitHub login except the configured operator (`OPERATOR_LOGIN`) and any configured `TEST_LOGINS`: `/callback` refuses before listing installations, `completeFor` (the single function backing `/callback`'s one-installation path, `/select`, and `/setup`) refuses again as a last line of defense, and the `github_token` mint refuses non-operator logins outright — killing any already-bound outside grant immediately, with no KV migration needed. Refusals are explicit (403 / `isError` with a named reason), never a silent 404. Driven by an installation-escalation incident: one shared repository let an outside GitHub login bind the operator's whole App installation. This is an interim plug, not the fix — the ruled v1.0.0 user-token shape is the real remediation and is tracked separately. See `docs/reviews/2026-09-05-klappy-only-lockdown.md` and the incident ticket (`klappy/kitchen` rail item, 2026-09-01, gitauth installation escalation).

## v0.3.0 — Unreleased (Connectors Directory phases 1–2)

### Breaking

- **`github_token` without `permissions` now mints read-only** (`{"contents":"read"}`). Connections that relied on a bare call minting the App's full grant must now request write by name: `{"permissions":{"contents":"write","pull_requests":"write"}}` — same single call, same cost. Rationale and the user-side teaching live in `governance/external/getting-started.md` ("Read first, write by asking") and `governance/external/prompt-injection-stance.md`.

### Added

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
