# Git Repo Auth — Complete Knowledge Base
*Source document for NotebookLM projections: video overview, presentation, infographic, podcast, and other generated media. Compiled 2026-06-12 from the live repository and brand system. Everything here is public-facing or approved listing copy.*

---

# 1. What Git Repo Auth Is

**One sentence:** Git Repo Auth is an MCP server that lets AI agents mint their own short-lived, scoped GitHub credentials — so humans never paste a Personal Access Token into a chat again.

**Tagline (official, 55 chars):** Connect GitHub once; agents mint expiring scoped tokens

**The listing description (official):** Git Repo Auth bridges MCP to GitHub App installation tokens. Connect once with GitHub, choose which account to bind, and from then on your agent mints its own credentials on demand — each token read-only by default, scoped to your installation, and dead within the hour. You never paste a PAT into a chat again. GitHub enforces every wall: the permission ceiling, the repository scope, the expiry, and the bot-attributed audit trail. Your kill switch is one click — uninstall the app — and requires nothing from us.

**The origin goal — "PAT Transcendence":** retire manual GitHub Personal Access Tokens in favor of worker-minted, scoped tokens usable by AI agents. A PAT is long-lived, broad, and pasted into chats where it can leak. A minted installation token is the opposite on every axis: short-lived (≤1 hour), narrow (per-call scope, per-installation repositories), and requested by the agent at the moment of need.

**What it is NOT:** It is not a GitHub tools connector. It exposes zero repository tools — no "create PR," no "read issue." It mints credentials; the agent does the GitHub work directly with raw git and the REST API. This is why it complements rather than duplicates Claude Code, Cowork, and the built-in GitHub integration: it is the credential layer underneath all of them. Proven in production: the same server, with zero per-surface work, serves Claude.ai web, Claude Desktop, Claude iOS, Claude iPadOS, Claude Code (desktop and cloud), and Cowork.

# 2. Key Use Cases (official listing copy)

Agentic coding against real repositories (clone, branch, PR) without long-lived credentials; code-review and issue-triage agents needing temporary read access; multi-agent fleets where each task carries its own expiring, down-scoped token; CI-adjacent automation with bot-attributed provenance. Complements rather than duplicates GitHub tooling: the server exposes no repository tools itself — it mints the scoped, expiring credentials any agent (chat, Claude Code, or fleet) uses to do the work directly.

# 3. The Security Model — "GitHub Enforces Every Wall"

The product's core argument is that the operator's service should hold as little trust as possible; GitHub holds the rest.

- **Permission ceiling** → the GitHub App grant the user installed. The server cannot mint beyond it.
- **Repository scope** → only the repositories the user selected at install (changeable anytime on GitHub).
- **Expiry** → every token dies within 1 hour. There is no refresh; *expiry is the rotation*.
- **Audit trail** → every action taken with a minted token is signed by the App's bot identity, `git-repo-auth[bot]`. Even a permission denial names the bot.
- **Kill switch** → uninstalling the GitHub App stops all minting instantly. It is enforced by GitHub and requires nothing from the service operator.

**Secure by default, open by instruction:** a bare `github_token` call mints a READ-ONLY token ({"contents":"read"}). Write permissions (contents, pull_requests, optionally workflows) must be requested explicitly, per call, by name. The default protects the user who never read the docs; the explicit request serves the user who did.

**No tokens stored, ever.** The service stores only: hashed OAuth grant records (the session), the GitHub login + installation binding, quota counters (mint log expires after 8 days; live-token records die in minutes), and 10-minute transient connect-flow records. No repository data, no content, no analytics warehouse.

# 4. The Two Tools

| Tool | Human name | What it does |
|---|---|---|
| `github_token` | Mint GitHub token | Mints a ≤1-hour installation token. Read-only by default; explicit per-call write scopes; optional per-repository down-scoping. Usable as a git-over-HTTPS password (username: x-access-token) or REST API Bearer token. Every response includes quota transparency fields. |
| `docs` | Service documentation | Serves the governance documents verbatim: tiers, quota mechanics, getting started, privacy, terms, prompt-injection stance. |

(A third tool, `admin_stats`, is operator-gated observability — aggregates only, never visible on user connections.)

# 5. Quota Transparency — "Every Response Carries Its Own Accounting"

Every mint response includes: `tier`, `remaining`, `window_reset_at`, `weekly_remaining`, `cached`, `governance_source`. Re-requesting the same scope while a token is live returns `cached: true` and costs nothing. The pricing page renders live from the same governance document the server enforces — *the page can't promise something the service doesn't keep*.

# 6. Pricing (the five-tier ladder)

- **Free** — one-time bucket of 100 mints (fifty look-and-act pairs), no expiry, no card. The designed first-run experience.
- **Solo** — $1/month, billed $24 every 2 years. 5 agents (10 tokens) per rolling 5-hour window.
- **Pro** — $5/month, billed $60 yearly. 30 agents (60 tokens) per rolling 5-hour window.
- **Team** — $25/month. 200 agent slots per rolling 5-hour window. "A team of agents — one human, no seats."
- **Fleet** — $100/month. 1,000 agent slots per rolling 5-hour window. "Never think about the window again."

Every tier budgets two tokens per agent — a read-only token to look, a write token to act; the mix isn't policed. Rules: the hero number on any pricing surface is always the per-month price. Upgrades are prorated and immediate. No refunds; cancel anytime, access runs to period end. Self-hosting the same open-source code is $0 forever.

# 7. Brand Identity & Style Guide

**The metaphor: the minted seal.** Tokens are coins struck on demand — each one carries its own expiry like a clock face. The brand's visual and verbal language flows from minting, seals, certificates, and clockwork.

**The mark:** a key whose bow is a clock face — credentials and expiry fused into one object. Cream/paper key, amber hands, on deep green. Earlier mark: "the struck coin" (viridian rounded square, key reversed out, amber clock-dial hand). Deployed at https://gitauth.klappy.dev/favicon.svg and /icon-512.png.

**Palette (canonical hex):**
- Pine `#08322A` — deep ground, GitHub badge background
- Viridian `#0E5A4A` — primary brand green
- Paper `#FAFAF6` — warm off-white, the coin/key material
- Amber `#D9A441` — clock hands, accents, the "time" color
- Ink `#0E1311` / Ink-soft `#373D3A` — text on paper
- Stamp `#B33A2B` — denials, errors, the red wax
- Lobby `#FFFFFF` / Lobby-deep `#F0F3F1` / Line `#C7CCC9` — light surfaces and rules

**Typography:** Archivo (variable; wide widths and heavy weights for display, e.g. weight 800 / width 112%) + IBM Plex Mono (code, JSON, labels, eyebrows with wide letter-spacing).

**Statement descriptor on card statements:** COVENYNT* GITAUTH.

**Signature phrases (use verbatim in media):**
- "Expiry is the rotation."
- "GitHub enforces every wall."
- "The denial is the receipt."
- "You never paste a PAT into a chat again."
- "Secure by default, open by instruction."
- "The page can't promise something the service doesn't keep."
- "Keys handled for you."
- "PAT transcendence."

**Voice:** plain verbs, active voice, specific over clever. Confidence comes from showing real output — actual JSON responses, actual GitHub denials — not adjectives. Honest about limits (the README documents the Workflows-permission escalation path openly). Errors explain; they never apologize or go vague.

# 8. Story Beats (for video / podcast / presentation)

1. **The problem:** AI agents need GitHub access. Today's answer is pasting a long-lived PAT into a chat — broad, immortal, leakable.
2. **The inversion:** what if the agent minted its own credential, at the moment of need, scoped to the task, dead within the hour?
3. **The demo beat — the mint:** call `github_token` with no arguments. Read-only token, expiry timestamp, quota accounting, all in one reply.
4. **The demo beat — the denial:** try to push with it. GitHub refuses with a 403 *naming the bot identity*. The security model demonstrates itself.
5. **The demo beat — the write:** ask again, by name: contents write, pull_requests write. The commit lands signed `git-repo-auth[bot]` — auditable provenance.
6. **The trust story:** the service stores no tokens, holds no power GitHub doesn't delegate, and the kill switch (uninstall) belongs entirely to the user.
7. **The breadth proof:** one server, zero per-surface work, runs everywhere Claude does — phone, web, desktop, Claude Code, Cowork. This entire product was submitted to the directory *from a phone*, using its own minted tokens to push its own commits.
8. **The honest economics:** real free tier (50 mints, no card), plans from $1/month, prorated upgrades, no refunds because you can try before you pay, and $0 self-hosting of the same open code.

# 9. Entity & Links

- **Operated by:** Covenynt Ventures LLC — https://covenynt.com (named in terms, privacy, footer, README; appears on Stripe statements)
- **Brand home:** klappy.dev — built and maintained by Chris "Klappy" Klapp
- **Service:** https://gitauth.klappy.dev · MCP endpoint: https://gitauth.klappy.dev/mcp
- **Repo (open source):** https://github.com/klappy/git-repo-auth-mcp
- **GitHub App:** https://github.com/apps/git-repo-auth
- **Policies:** https://gitauth.klappy.dev/privacy · /terms · /security
- **Support:** support@klappy.dev · https://github.com/klappy/git-repo-auth-mcp/issues

---

# APPENDIX — Public Governance Documents (verbatim from the repository)


---

## A. Repository README
*(verbatim: `README.md`)*

# Git Repo Auth MCP

**Your AI can build things. This lets it save them — safely.**

When you ask an AI to build something, that work has to live somewhere. Developers keep theirs on GitHub — but GitHub expects you to create and manage digital keys, and that's where most people give up.

This bridge handles the keys for you. Connect your GitHub account once. After that, every time your AI needs to save work, it gets a fresh key that opens only the one door it needs — and the key expires in an hour.

That's actually *safer* than what most professionals do. The common shortcut is one master key that opens everything and lasts for years. Here, there's no master key to lose — and if you ever want out, one click disconnects everything.

You never see a key. You never touch a key. You just ask, and it saves to GitHub.

## Want this with nearly zero effort?

You don't have to run anything. The hosted bridge is live:

- **New to all this?** Start here: https://gitauth.klappy.dev/start — connected in about a minute, no card for the trial.
- **Developer?** The fast path: https://gitauth.klappy.dev/start-developers
- **The deal:** a real free trial, then plans from $1/month. Pricing and limits render live from [the same rulebook the server enforces](https://gitauth.klappy.dev/#pricing).
- **Who you're dealing with:** the hosted service is operated by [Covenynt Ventures LLC](https://covenynt.com) — that's the name on Stripe receipts and in the [terms](https://gitauth.klappy.dev/terms).
- **Rather hold your own keys?** https://gitauth.klappy.dev/self-host — same code as this repo, $0 forever.

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

Add this server to your MCP client — the hosted bridge endpoint is:

```
https://gitauth.klappy.dev/mcp
```

(Self-hosting? Substitute your own deployment's `/mcp`.)

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


---

## B. Getting Started
*(verbatim: `governance/external/getting-started.md`)*

# Getting Started

Never given an AI system real access to your repos before? This is the walkthrough. You have a free bucket of 50 token mints — enough to genuinely experience it, no card required.

## The two-minute path

1. **Connect.** Add this server to your MCP client (`https://<deployment>/mcp`). Your client walks you through GitHub login and installing the GitHub App on whichever repos you choose. You control the scope; GitHub enforces it.
2. **Make a sandbox.** First time? Don't start on something precious. Create a fresh repository — [github.com/new](https://github.com/new) — name it anything (`agent-playground` works). Install the app on just that repo.
3. **Tell your agent the repo name.** Then ask for something real: "clone agent-playground, scaffold a small site, and open a PR." The agent calls `github_token` itself — requesting write scope for the push in the same call — and you never touch a credential.
4. **Watch the PR arrive.** Commits land under the app's `[bot]` identity, tokens die within the hour, and your kill switch is always one click: uninstall the app.

## Read first, write by asking

Your agent's first token is read-only by design: calling `github_token` with no arguments mints `{"contents":"read"}`. When the task writes — pushing commits, opening PRs — the agent requests it in the same single call: `{"permissions":{"contents":"write","pull_requests":"write"}}`. Same call, same cost, same one-hour life; the tool's own description shows the write example, so any capable agent finds it without your help.

If your workflow writes as much as it reads, tell your agent once — "when working in my repos, request contents and pull_requests write" — and it will mint accordingly. Caution is the default, not a ceiling; you set your own.

## Pull requests in your name: the one-click handoff

Commits and PRs your agent creates with minted tokens are attributed to the App's bot identity — honest and auditable, but some tooling keys on PR authorship (review bots on individual plans, your own "created by me" filters), and sometimes you simply want the PR to be yours.

The smooth pattern: **let the agent push the branch, and you open the PR with one click.** After pushing, GitHub exposes a ready-made creation link for any branch:

```
https://github.com/<owner>/<repo>/pull/new/<branch>
```

(or a compare link, `https://github.com/<owner>/<repo>/compare/<base>...<branch>`, if you want to pick the base). A PR opened from that link is authored by *you* — author-matched tooling triggers, your filters see it, and the branch's commit history still carries the agent's work transparently.

Tell your agent once: *"after pushing a branch, give me the pull-request creation link instead of opening the PR yourself."* From then on every handoff is a single click. Agents can still open PRs directly when bot authorship is fine for your workflow — both paths are legitimate; this tip just makes the personal one effortless.

## What to try with your 50 mints

- Point it at an old project and ask for a code review PR.
- Have it triage your open issues and draft fixes.
- Run two agents on two repos at once and feel what concurrency buys.

## When the bucket runs out

That's the signal you've felt it. `remaining` counts down on every mint; at zero, the response carries an upgrade link. Tiers are priced on how many agents you want working at once — see `tiers.md`, which your agent can fetch through the `docs` tool and explain to you. Upgrades are prorated and immediate: a few days or weeks in, switching tiers costs the difference, not a restart.


---

## C. Tiers & Pricing (the enforced rulebook)
*(verbatim: `governance/external/tiers.md`)*

# Tiers and Quotas

> This document is the single source of truth for tier limits. The server reads it; the `docs` tool serves it; what you read here is what the code enforces. If behavior and this document disagree, the document wins and the code has a bug.

## What you are paying for

Concurrency. A minted token lives at most one hour, and an agent doing real work typically mints twice — a read-only token to look (the secure default), then a write token to act. So every tier budgets **two tokens per agent**: Solo is 5 agents and 10 tokens, Pro is 30 agents and 60 tokens, and so on. We don't police the mix — two reads, two writes, a read and a write, all the same to us; the pair is generosity, not a rule. Minting costs the operator almost nothing — your API traffic rides your own GitHub installation's rate limit (5,000–12,500 req/hr, isolated per installation, enforced by GitHub). The tiers price throughput, and we'd rather say that plainly than dress it up.

## The tiers

How big is your agentic concurrency? Every tier is one human, no seats — the team is your agents. Tier sizes are agent counts (Solo 5, Pro 30, Team 200, Fleet 1,000); the token column is double that, because looking and acting are both tokens.

| Tier | Tokens per rolling 5-hour window (two per agent) | Weekly backstop | Price |
|---|---|---|---|
| Free | one-time bucket of **100 mints total** | — | $0 |
| Solo | **10** | 120 | $1/mo ($24 per 2 years) |
| Pro | **60** | 720 | $5/mo ($60 per year) |
| Team | **400** | 4,800 | $25/mo |
| Fleet | **2,000** | 24,000 | $100/mo |

Billing cadence scales with commitment: Solo is $1/mo billed $24 per two years, Pro is $5/mo billed $60 per year, Team and Fleet are month-to-month. Above it, the per-slot price falls as you climb — $0.20 at Solo, $0.167 at Pro, $0.125 at Team, $0.10 at Fleet — so upgrading is always the better deal per agent. No bundling tricks, no "contact sales." Upgrades are prorated and immediate: switch mid-period and the unused remainder of your current tier is credited toward the new one — a few days or weeks in, when you hit the wall, upgrading costs the difference, not a restart. Downgrades take effect at period end.

## How the free bucket works

You get 100 mints, once. No windows, no decay, no daily trickle. Use all 100 in an hour or spread them over a month — your call. When the bucket is empty, minting stops and the response tells you how to upgrade. A hundred mints — fifty look-and-act pairs — is enough to genuinely feel what it's like to hand an agent your repos; if you burned through them, you already know whether this is worth paying for.

## How paid windows work

- The 5-hour window is **rolling**: each mint counts against you for exactly five hours, then falls off. `window_reset_at` tells you when your next slot frees. Mint your quota in a burst and you wait; spread mints out and you may never notice the window.
- The **weekly backstop** exists for abuse protection. It is set high enough (12× the window quota) that normal use never touches it.
- **Cached tokens are free.** Re-requesting the same scope while a previous token is still alive returns the cached token and does not count as a mint. Retries cost you nothing.
- **Failed mints are free.** If GitHub refuses the mint — a dead installation, a permissions mismatch, an outage — no quota is spent. You are only charged for tokens you actually receive.

## When you hit a limit

Minting fails with a clear message: which limit you hit, when it resets (`window_reset_at`), and where to upgrade. There is no "request more" queue — the wall is the wall, and the next tier is the answer. Every successful mint also tells you where you stand (see `quota-transparency.md`), so the wall is never a surprise.


---

## D. Quota Transparency
*(verbatim: `governance/external/quota-transparency.md`)*

# Quota Transparency

Every user — free bucket through Max 20x — sees the same accounting. Nothing is hidden; the response itself teaches your agent how to manage your quota.

## Fields on every `github_token` response

| Field | Meaning |
|---|---|
| `tier` | Your current tier (`free`, `pro`, `max_5x`, `max_20x`) |
| `remaining` | Mints left — bucket balance on free, window quota remaining on paid |
| `window_reset_at` | ISO timestamp when the current 5-hour window resets (paid tiers; absent on free) |
| `weekly_remaining` | Mints left under the weekly backstop (paid tiers) |
| `cached` | `true` when this response reused a live token — no quota was spent |

## Fields on a quota-exceeded failure

| Field | Meaning |
|---|---|
| `limit_hit` | `bucket_empty`, `window`, or `weekly` |
| `window_reset_at` | When minting becomes possible again (window/weekly) |
| `upgrade_url` | Checkout link for the next tier |

## Guidance for agents

- Check `cached` before worrying: reusing a token costs nothing, so prefer the same scope over re-scoping when both work.
- When `remaining` is low, batch work into fewer concurrent sessions rather than minting per task.
- On `bucket_empty`, surface the upgrade decision to your human — do not retry. The bucket does not refill.
- On `window`, the honest move is to wait for `window_reset_at` or tell your human that more concurrency requires the next tier.


---

## E. Privacy Policy
*(verbatim: `governance/external/privacy-policy.md`)*

# Privacy Policy — Git Repo Auth MCP

*Operator-approved 2026-06-10. Serving route and docs-tool registration land in the docs-page task.*

*Effective: 2026-06-10. This policy covers the hosted Git Repo Auth MCP service, operated by **Covenynt Ventures LLC** (https://covenynt.com) — the entity that collects and controls the data described below. If you self-host the same code, you are the operator and this policy does not apply to your instance.*

## What this service does

Git Repo Auth MCP lets an AI agent connected to your account mint short-lived, scoped GitHub tokens for repositories where you have installed our GitHub App. We designed it to hold as little as possible.

## What we collect and store

- **OAuth grants.** When your MCP client connects, the OAuth provider stores a hashed grant record in Cloudflare KV. This is what lets your session mint tokens without re-authenticating.
- **Your GitHub login and installation binding.** Your GitHub username and the numeric ID of the App installation you chose at connect time. The username is also the key for quota accounting and billing.
- **Quota records.** A counter of your remaining free mints, your paid tier if any, an append-only log of mint events that expires after 8 days, and short-lived records of live tokens (so re-requesting the same scope is free and uncounted).
- **Transient connect-flow records.** During account selection at connect time, a pending record exists for at most 10 minutes, then expires.

## What we never store

- **GitHub tokens — none, ever.** Installation tokens are minted on demand, returned to your session, and expire within one hour. They are not written to any storage we control.
- **Your GitHub password or App private keys.** You never give us credentials. The GitHub user token from your login is used for two read-only API calls (to find your installations) and discarded.
- **Repository contents.** The service never reads your code. Tokens are used by *your* agent, not by us.

## How we use what we hold

Grant records authenticate your session. The login + installation binding scopes every mint to your account. Quota records enforce tier limits and, on paid tiers, emit usage events for billing. Nothing is used for advertising, profiling, or training.

## Third parties

- **GitHub** — receives token mint requests for your installation; enforces all permission boundaries. Governed by GitHub's own terms and privacy policy.
- **Stripe** — processes payments for paid tiers. A completed checkout is linked back to your GitHub login via a checkout reference ID. We never see your card details. Stripe is the source of truth for your subscription.
- **Cloudflare** — hosts the service (Workers + KV). Standard infrastructure logging applies.

We do not sell or share your data with anyone else.

## Data retention

| Data | Lifetime |
|---|---|
| Minted GitHub tokens | ≤ 1 hour, never stored by us |
| Connect-flow pending records | 10 minutes |
| Mint event log | 8 days |
| Live-token cache records | Until the token expires |
| OAuth grants, login/installation binding, tier | Until you disconnect or uninstall |

## Your controls

- **Disconnect** the connector in your MCP client to end the session grant.
- **Uninstall the GitHub App** from your account — this is the kill switch. Minting for your account stops immediately; any outstanding token dies within the hour.
- **Cancel billing** via Stripe at any time; tier reverts at period end.
- **Deletion requests:** contact us (below) and we will remove your KV records.

## Contact

- Operator: Covenynt Ventures LLC — https://covenynt.com
- Email: support@klappy.dev
- Issues: https://github.com/klappy/git-repo-auth-mcp/issues

Changes to this policy will be posted at this URL with a new effective date.


---

## F. Terms of Service
*(verbatim: `governance/external/terms-of-service.md`)*

# Terms of Service — Git Repo Auth MCP

*Operator-approved 2026-06-10. Serving route and docs-tool registration land in the docs-page task.*

*Effective: 2026-06-10. The hosted Git Repo Auth MCP service is operated by **Covenynt Ventures LLC** (https://covenynt.com), and this agreement is between you and Covenynt Ventures LLC. By connecting to the hosted service, you agree to these terms. If you self-host the code, these terms do not apply to your instance.*

## 1. The service

Git Repo Auth MCP mints short-lived, scoped GitHub App installation tokens on behalf of accounts that have installed our GitHub App. What the service can and cannot reach is enforced by GitHub: tokens are bounded by the App's permission grant, your installation's repository selection, and a one-hour expiry.

## 2. Your responsibilities

- You connect this service to AI agents that act with the tokens it mints. **You are responsible for what your agents do with those tokens**, including commits, pull requests, and workflow changes made under the App's bot identity on your repositories.
- Install the App only on repositories you are comfortable granting your agents access to.
- Do not attempt to circumvent quota enforcement, probe other users' installations, or use the service to access repositories you do not control.

## 3. Tiers, billing, and quotas

- Tier limits and pricing are published at [tiers documentation URL] and served verbatim by the service's `docs` tool. The published document is authoritative; if service behavior and the document disagree, the document wins and the behavior is a bug.
- Paid tiers are billed via Stripe by Covenynt Ventures LLC; charges appear on your statement under the Covenynt Ventures name. Billing is at the cadence stated per tier (Solo: $24 per two years; Pro: $60 per year; Team and Fleet: monthly). You may cancel anytime; access continues to period end.
- **Upgrades are prorated and immediate.** Switch to a higher tier at any time; the unused remainder of what you already paid is credited toward the new tier, so you never pay twice for the same days. Downgrades take effect at the end of the current period.
- **Refunds: none.** Subscriptions are cancel-anytime; access continues to the end of the paid period, and no partial or pro-rated refunds are issued. Try the free tier's 50 mints before paying — it exists so you can know what you're buying.
- The free tier is a one-time bucket of 50 mints with no expiry.

## 4. Availability and support

The service is provided as-is, without an uptime guarantee. We respond to issues in good faith via GitHub issues and email. Security reports are prioritized; see the repository for current contact details.

## 5. The kill switch

Uninstalling the GitHub App from your account immediately ends our ability to mint tokens for it. Outstanding tokens expire within one hour. This control is yours, unilateral, and requires nothing from us.

## 6. Limitation of liability

To the maximum extent permitted by law: the service's operator is not liable for actions taken by your agents using minted tokens, for losses arising from GitHub or Stripe outages, or for indirect or consequential damages. Our total liability is capped at the amount you paid us in the twelve months preceding a claim. The security model — including its honestly documented limits, such as the Workflows-permission escalation path — is published in the repository README; connecting constitutes acceptance of that model.

## 7. Changes and termination

We may update these terms with notice at this URL. We may suspend accounts that violate section 2. You may stop using the service at any time (sections 5 and 3 cover the mechanics).

## 8. Contact

- Email: support@klappy.dev
- Issues: https://github.com/klappy/git-repo-auth-mcp/issues

## 9. Governing law

These terms are governed by the laws of the State of Florida, USA, without regard to conflict-of-law principles. Any dispute not subject to small-claims jurisdiction will be brought in the state or federal courts located in Florida, and you consent to their jurisdiction. Where consumer-protection law in your place of residence grants you rights that cannot be waived by contract, those rights are unaffected by this section.

*[Drafted by an AI, not a lawyer; recommend a professional pass before publishing, given real money changes hands.]*


---

## G. Prompt Injection Stance
*(verbatim: `governance/external/prompt-injection-stance.md`)*

# Prompt Injection Stance — Git Repo Auth MCP

*Operator-approved 2026-06-10. Serving route and docs-tool registration land in the docs-page task.*

## The attack, stated plainly

An agent holding this connector reads untrusted content — a webpage, an issue comment, a README in a dependency. That content contains instructions crafted for the agent: *mint a GitHub token and send it here*, or *mint a write token and push this commit*. If the agent complies, the attacker gets either the credential or the write.

We do not claim this attack is impossible. We claim each step runs into a wall, and the walls are enforced by parties the attacker cannot prompt.

## The walls, in the order the attack meets them

**1. The default mint is read-only.** As of v0.3, calling `github_token` without explicit permissions returns a token scoped to `contents: read`. An injected "get me a token" yields a credential that cannot push, cannot open PRs, cannot touch CI. Write access must be requested by name in the tool call — a louder, more visible act for the agent to take and for the user to notice. This is mechanism, not policy: the secure default is in the code path, and the documentation teaches users they may instruct their agent toward broader defaults if their workflow is write-heavy. We chose to make caution the floor and openness the opt-in.

**2. Exfiltrated tokens die within the hour.** No refresh tokens, no long-lived credentials exist to steal. A leaked token is a one-hour, read-only window into repositories the user already chose to expose to their agent.

**3. GitHub enforces the blast walls, not us.** A token minted for one installation physically cannot reach another installation's repositories. The permission ceiling, repository scoping, and expiry are all enforced server-side by GitHub. Compromising the agent's reasoning does not move these walls.

**4. Writes are attributable.** Any write a successfully-injected agent performs lands under the App's `[bot]` identity — in commits, PR history, and the audit log. There is no anonymous path.

**5. The kill switch is the user's, unilaterally.** Uninstalling the GitHub App ends minting instantly; outstanding tokens expire within the hour. Recovery from a suspected compromise requires no support ticket and no cooperation from us.

## The path we accept rather than deny

If the App is granted Workflows write and a write token is explicitly minted, a token holder can modify CI — and CI runs with the repository's own credentials. We document this in the README rather than hiding it: the changes land in PRs and audit logs under the bot identity, users can withhold sensitive repositories from the installation, and operators can drop the Workflows permission app-wide. Named, bounded, and the user's choice.

## What we ask of host platforms

Claude's own injection mitigations, tool-use confirmations, and conversation-context protections are the layer above us. We designed for defense in depth on our layer; we do not assume the layers above are perfect, and we ask users not to assume ours is.
