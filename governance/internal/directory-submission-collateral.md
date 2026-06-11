# Connectors Directory — Submission Form Collateral

Every field the MCP directory submission form asks for, pre-answered. Source of field list: claude.com/docs/connectors/building/submission (fetched 2026-06-10; re-fetch same-day before form-fill — the page is mid-migration). Items marked ⏳ depend on merge/deploy or operator-side setup.

## Server basics

- **Name:** Git Repo Auth
- **URL:** `https://gitauth.klappy.dev/mcp`
- **Tagline:** Connect GitHub once; your agent mints its own short-lived, scoped tokens.
- **Description (detail card, written by us, not editable by Anthropic):** Git Repo Auth bridges MCP to GitHub App installation tokens. Connect once with GitHub, choose which account to bind, and from then on your agent mints its own credentials on demand — each token read-only by default, scoped to your installation, and dead within the hour. You never paste a PAT into a chat again. GitHub enforces every wall: the permission ceiling, the repository scope, the expiry, and the bot-attributed audit trail. Your kill switch is one click — uninstall the app — and requires nothing from us.
- **Use cases:** agentic coding against real repositories (clone, branch, PR) without long-lived credentials; code-review and issue-triage agents needing temporary read access; multi-agent fleets where each task carries its own expiring, down-scoped token; CI-adjacent automation with bot-attributed provenance.
- **Category:** Developer tools

## Connection details

- **Auth type:** OAuth 2.1 — dynamic client registration + PKCE (S256), served by the worker (`@cloudflare/workers-oauth-provider`). Protected Resource Metadata at `/.well-known/oauth-protected-resource`. Inside the flow, the user signs in with GitHub and binds an App installation.
- **Transport:** Streamable HTTP.
- **Read/write capabilities:** read-only by default — a bare `github_token` call mints `{"contents":"read"}`. Write (`contents`, `pull_requests`, optionally `workflows`) is requested explicitly per call, ceilinged by the App grant the user installed. The `docs` tool is read-only.
- **Connection requirements:** a GitHub account; installing the Git Repo Auth GitHub App on at least one repository during the connect flow (zero installations routes the user to install; multiple shows a picker).

## Allowed link URIs

N/A — the server returns URLs as text in tool results; it does not use `ui/open-link`.

## Data & compliance

- **Data handling:** no GitHub tokens stored, ever; minted tokens live ≤1 hour. Stored: hashed OAuth grants (Cloudflare KV), GitHub login + installation binding, quota records (mint log TTL 8 days), 10-minute pending records during connect. Full policy: `https://gitauth.klappy.dev/privacy`.
- **Third-party connections:** GitHub (token minting; enforces all permission boundaries), Stripe (paid-tier billing; checkout reference maps to GitHub login), Cloudflare (Workers + KV hosting).
- **Health data:** none.

## Tools, resources & prompts

| Tool | Human-readable name | Annotations |
|---|---|---|
| `github_token` | Mint GitHub token | readOnlyHint: false, destructiveHint: false, openWorldHint: true |
| `docs` | Service documentation | readOnlyHint: true, idempotentHint: true |

No resources or prompts. Annotation presence confirmed via `tools/list`. ⏳ Confirm against deployed candidate post-merge.

## Documentation & support

- **Docs:** `https://gitauth.klappy.dev/` (landing) — getting started, tiers, quota transparency served via the `docs` tool and site. ⏳ public by publish date; shareable privately during review.
- **Privacy policy:** `https://gitauth.klappy.dev/privacy`
- **Terms:** `https://gitauth.klappy.dev/terms`
- **Security stance:** `https://gitauth.klappy.dev/security`
- **Support channel:** support@klappy.dev + https://github.com/klappy/git-repo-auth-mcp/issues

## Test account

⏳ Operator-side: dedicated GitHub account, App installed on a populated scratch repo (files, a branch, an open PR), `quota:tier:{login}` set to `fleet`. Step-by-step instructions to accompany credentials: connect `https://gitauth.klappy.dev/mcp` → GitHub login → bind the test installation → call `github_token` bare (observe read-only) → call with write permissions → use the token for a git clone → ask the `docs` tool about "tiers". Every tool run end-to-end via MCP Inspector and as a live custom connector before submission.

## Launch readiness

- **GA date:** ⏳ operator sets.
- **Surfaces tested:** ⏳ Claude.ai web, Claude Desktop, Claude mobile — run post-merge against the deployed candidate; record pass/fail per surface.

## Branding

- **Logo:** `https://gitauth.klappy.dev/favicon.svg` (the struck coin; raster set in `public/`)
- **Favicon verification:** `/favicon.ico` + `/favicon.svg` live.
- **Carousel screenshots:** N/A (not an MCP App).

## Policy & requirements checklists

- Directory policy compliance: ⏳ operator reads Anthropic Software Directory Terms (article 13145338) + Policy (article 13145358) + review-criteria page; compliance diff to be attached here.
- Technical: OAuth ✓ (2.1, PKCE, PRM), HTTPS ✓, Origin-header validation ✓ (v0.3, `src/origin.ts`), annotations ✓ (v0.3).
- Note for reviewer questions: quota-wall error responses include an `upgrade_url` string (Stripe checkout). Flagged for the policy read; will strip if the Directory Policy treats it as in-conversation commerce.
