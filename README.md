# Git Repo Auth MCP

Worker-minted, short-lived, scoped GitHub App installation tokens over MCP.

**Currently GitHub; forge-agnostic by design.** v1 mints tokens via GitHub's App installation-token mechanism. The name leaves the door open to other forges; nothing more is implemented yet.

## What this is

A small Cloudflare Worker exposing one MCP tool, `github_token`, that mints a ≤1-hour GitHub App installation token on demand — optionally down-scoped to specific repositories and permissions. Your AI agent calls the tool when it needs git or API access; the token expires on its own.

This replaces the pattern of minting personal access tokens by hand and pasting them into chat. **Expiry replaces rotation for the tokens. Rotation does not cease — it moves**: from a PAT that transits chat every session to an App private key that never transits anything and rotates rarely.

## Security model — read before deploying

**The bearer token is the entire security boundary.** Anyone who can call this worker's MCP endpoint can mint write-capable tokens for every repository the App is installed on. There is no second gate. The worker fails closed: without `MCP_AUTH_TOKEN` configured it serves nothing. Treat `MCP_AUTH_TOKEN` with the same care as the private key.

**"No Administration" does not mean "cannot escalate."** The recommended App permissions (Contents RW, Pull requests RW, Workflows RW, Metadata R) exclude Administration, which blocks settings, visibility, and credential changes via the API directly. But Workflows write means token holders can modify CI, and CI runs with the repository's own `GITHUB_TOKEN` — an indirect escalation path. It is accepted, not eliminated: CI changes land in PRs and audit logs under the App's `[bot]` identity, where they are visible and attributable. If that trade-off doesn't fit your threat model, drop the Workflows permission when creating the App.

**Your keys, your worker.** This is a self-host template. Nobody else custodies your App's private key — including the template's authors. Deploy it in your own Cloudflare account or don't deploy it.

**Kill switches:** uninstall the GitHub App, or delete the worker's secrets. Either one ends all minting immediately; outstanding tokens die within the hour.

## Setup (~10 minutes)

1. **Create the GitHub App.** GitHub → Settings → Developer settings → GitHub Apps → New GitHub App. Webhook: off. Repository permissions: Contents **RW**, Pull requests **RW**, Workflows **RW** (optional — see security model), Metadata **R**. Nothing else; explicitly not Administration. Note the **App ID**.
2. **Generate the private key.** GitHub downloads PKCS#1, but Workers WebCrypto requires PKCS#8 — convert before storing:
   ```sh
   openssl pkcs8 -topk8 -inform PEM -in your-app.private-key.pem -nocrypt -out app-pkcs8.pem
   ```
   The key never transits chat, in either format. That exposure is irreversible.
3. **Install the App** on the repositories it should serve. Note the **Installation ID** from the install URL (`.../installations/<id>`).
4. **Set secrets** (never commit, never paste in chat):
   ```sh
   wrangler secret put GH_APP_ID
   wrangler secret put GH_APP_INSTALLATION_ID
   wrangler secret put GH_APP_PRIVATE_KEY   # paste the PKCS#8 PEM
   wrangler secret put MCP_AUTH_TOKEN       # long random string, e.g. `openssl rand -hex 32`
   ```
5. **Deploy:** `npm install && npm run deploy`
6. **Connect** your MCP client to `https://<your-worker>/mcp` with header `Authorization: Bearer <MCP_AUTH_TOKEN>`.
7. **Do not retire existing PATs yet.** Retire them only after `github_token` is validated working — a failed deploy with no fallback credential is lockout.

## The tool

`github_token` — parameters, both optional:

- `repositories`: array of repo names (without owner) to scope the token to. Omit for all installed repos.
- `permissions`: permission map to down-scope, e.g. `{"contents": "read"}`. Must be a subset of the App's grant.

Returns `{ token, expires_at, permissions, repository_selection }`. Use the token as a password for git-over-HTTPS (username `x-access-token`) or as a Bearer token against the GitHub REST API.

Token caching is handled by `@octokit/auth-app`: expiry-aware and keyed on installation + repositories + permissions, so a broad cached token is never returned for a narrow request. The cache lives for the isolate's lifetime; cold starts mint fresh.

## Development

```sh
npm install
npm run typecheck
npm test           # auth-boundary unit tests
npm run dev        # local server; put dev values in .dev.vars (gitignored)
```

## License

Deliberately not yet licensed (all rights reserved by default) — a licensing decision for this template is pending and will be made once, deliberately, rather than at midnight. Open an issue if you need clarity before then.
