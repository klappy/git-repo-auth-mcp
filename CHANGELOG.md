# Changelog

## v0.3.0 — Unreleased (Connectors Directory phases 1–2)

### Breaking

- **`github_token` without `permissions` now mints read-only** (`{"contents":"read"}`). Connections that relied on a bare call minting the App's full grant must now request write by name: `{"permissions":{"contents":"write","pull_requests":"write"}}` — same single call, same cost. Rationale and the user-side teaching live in `governance/external/getting-started.md` ("Read first, write by asking") and `governance/external/prompt-injection-stance.md`.

### Added

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
