# Git Repo Auth MCP

**Your AI can build things. This lets it save them — safely.**

When you ask an AI to build something, that work has to live somewhere. Developers keep theirs on GitHub — but GitHub expects you to create and manage digital keys, and that's where most people give up.

This bridge handles the keys for you. Connect your GitHub account once. After that, every time your AI needs to save work, it gets a fresh key that opens only the one door it needs — and the key expires in an hour.

That's actually *safer* than what most professionals do. The common shortcut is one master key that opens everything and lasts for years. Here, there's no master key to lose — and if you ever want out, one click disconnects everything.

You never see a key. You never touch a key. You just ask, and it saves to GitHub.

## The technical version

**Connect GitHub once. Your agent mints its own short-lived, scoped tokens after that.**

A Cloudflare Worker that bridges MCP's OAuth to GitHub App installation tokens. Users click "Connect," log in with GitHub, and choose which account to bind. From then on, their MCP session can call one tool — `github_token` — which returns a ≤1-hour token scoped to *their* installation, optionally down-scoped per request.

**Currently GitHub; forge-agnostic by design.**

## How the bridge works

1. An MCP client (Claude, etc.) connects to `/mcp` and is sent through a standard OAuth 2.1 flow (dynamic client registration, PKCE) served by this worker.
2. Inside that flow, the user logs in with GitHub. The worker checks which installations of **this GitHub App** the user actually controls (`GET /user/installations` — GitHub filters by both app and user).
3. Zero installations → the user is sent to install the app on their repos. One → bound automatically. Several → a picker.
4. The grant is bound to that installation ID. Every later `github_token` call mints for that installation only. **GitHub enforces the walls**: a token minted for one installation physically cannot touch another's repositories.

## Security model — read before trusting

**What is never stored.** No GitHub tokens, ever. Installation tokens are minted on demand and die within the hour. The GitHub user token from login is used for two GET requests and discarded. The worker's state is: its own OAuth grants (hashed, in KV) and 10-minute pending records during account selection.

**What the operator holds.** One GitHub App private key — their own, in worker secrets. Users never hand over keys. This is the standard model every CI service uses.

**Blast radius, honestly.** If this worker is compromised, the attacker gains minting capability over the repos of *every account that installed the app* — not their keys, not their accounts, but their installed scope, within the app's permission ceiling. Your kill switch as a user is first-class and unilateral: **uninstall the app**, and minting for your account ends instantly; outstanding tokens die within the hour. If that trust trade doesn't fit you, self-host your own instance (below) — it's the same code.

**"No Administration" ≠ "cannot escalate."** The recommended grant (Contents RW, PRs RW, Workflows RW, Metadata R) excludes Administration. But Workflows write means a token holder can modify CI, and CI runs with the repo's own credentials. The path is accepted, not eliminated: CI changes land in PRs and audit logs under the app's `[bot]` identity. Users who don't want the trade can simply not grant the app repos where it matters — or the operator can drop the Workflows permission app-wide.

**Per-request enforcement.** The permission ceiling, repository scoping, one-hour expiry, and bot provenance are all enforced by GitHub, not by this code.

## Connect (as a user)

Add this server to your MCP client:

```
https://<deployment>/mcp
```

Your client will walk you through GitHub login and installation binding. Then ask your agent to call `github_token` when it needs git or API access.

`github_token` parameters (both optional): `repositories` (names, no owner) and `permissions` (e.g. `{"contents":"read"}`) — each must be within what the app was granted and where it's installed.

## Operate (run your own bridge)

1. **Create a GitHub App** (Settings → Developer settings → GitHub Apps → New). Webhook off. Permissions: Contents **RW**, Pull requests **RW**, Workflows **RW** (optional — see security model), Metadata **R**. Nothing else; explicitly not Administration. Make the app **public** if others should be able to install it.
2. **Enable user OAuth on the app:** set Callback URL to `https://<deployment>/callback`, then generate a **client secret** (App settings → Client secrets). Note the **Client ID**.
3. **Generate the private key.** Paste it as-is — the worker auto-converts GitHub's PKCS#1 format to the PKCS#8 that WebCrypto needs. (Manual fallback if ever needed: `openssl pkcs8 -topk8 -inform PEM -in key.pem -nocrypt`.) The key never transits chat in any format.
4. **Set the slug** in `wrangler.jsonc` (`GH_APP_SLUG`, from `github.com/apps/<slug>`) and create a KV namespace for the `OAUTH_KV` binding if the committed ID isn't yours: `wrangler kv namespace create OAUTH_KV`.
5. **Secrets** (never committed, never pasted in chat):
   ```sh
   wrangler secret put GH_APP_ID
   wrangler secret put GH_APP_PRIVATE_KEY    # the PKCS#8 PEM
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   ```
6. **Deploy:** `npm install && npm run deploy`
7. Keep any existing PAT until the first real token mints. Retiring the fallback before validating the replacement is how lockouts happen.

Retired in v0.2: `MCP_AUTH_TOKEN` (replaced by per-user OAuth) and `GH_APP_INSTALLATION_ID` (now bound per grant).

## Development

```sh
npm install
npm run typecheck
npm test
npm run dev    # local; dummy values in .dev.vars (gitignored)
```

## Troubleshooting & project journal

Field-observed failures and fixes live in [`docs/troubleshooting.md`](docs/troubleshooting.md) — start there if a token "doesn't work." The evidence behind each entry is the project journal under [`odd/ledger/`](odd/ledger/): dated DOLCHEO records of what was observed, learned, and decided. New observations go to the journal first, then get distilled into troubleshooting.

## License

Deliberately not yet licensed (all rights reserved by default) — a licensing decision is pending and will be made once, deliberately. Open an issue if you need clarity before then.
