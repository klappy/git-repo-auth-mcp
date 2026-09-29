# Changelog

## v1.0.0 — Coming (Breaking: user access tokens, App as the ceiling)

> Superseded 2026-09-27 (spec dish `2026-09-01-gitauth-v1-user-tokens-spec`, shape 🅰 ruled 2026-09-01).
> v0.3.0 below stays live until v1.0.0 deploys. Not backwards compatible. Version number 1.0.0 vs 2.0.0:
> captain ruling pending; this entry renames if ruled otherwise.

### Breaking

- **Tokens are user access tokens, not installation tokens.** `github_token` mints a GitHub App
  *user-to-server* token (`ghu_`) on behalf of the logged-in user. Its reach is the **intersection** of
  what that user can already do and what the App registration allows — the App is the ceiling, the
  user is the floor. A token is exactly your reach, never another account's.
- **Installation picker removed.** `/callback` no longer binds a grant to an installation ID. The
  binding that let a collaborator pick another account's installation (see Security) is gone by
  construction.
- **`permissions` parameter removed** from `github_token`. Permissions come from the registration
  (`app-manifest.json`) and the user's own access; there is nothing to ask for.
- **`repositories[]` → `repository_id`.** One named repository per mint. "Read then write = two mints"
  is retired: one mint per repo.
- **Existing grants force-reconnect.** Every v0.x OAuth grant is invalidated at deploy; users
  reconnect once. The v0.3.0 statement "No GitHub tokens, ever" is superseded: v1 stores **one
  encrypted refresh token per user**, revocable at github.com; access tokens are never stored.
- **ARS machine-credential path is the only installation-token caller** (`docs/machine-credential-path.md`).

### Security

- **Installation-binding escalation.** Found 2026-09-01 by the operator; 0 tenants exposed. In
  v0.2–v0.3 a user who could log in and see another account's installation of this App could bind a
  grant to it and mint tokens for that account's selected repositories. The public claim "a minted
  token physically cannot reach another account's repositories" (README, `public/under-the-hood.html`)
  was false for that path. v1 removes the picker; until then no second account onboards.
  `[captain wording pending — ticket "security-note wording ruling"]`
- **Registration over-grant.** On 2026-09-01 the public registration (`GET /apps/git-repo-auth`)
  showed 100+ permissions at write, including Administration — contradicting README "excludes
  Administration". The declared registration is now `app-manifest.json` (Contents RW, Pull requests RW,
  Metadata R; `github_app_authorization` event; user-token expiration on). A CI drift check against
  the public endpoint is owed (spec slice S6).

## v0.3.0 — Live (Connectors Directory phases 1–2)

> Closed 2026-09-27: this is what is deployed at gitauth.klappy.dev today. Superseded by v1.0.0 above
> when it lands; text retained (R14).

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
