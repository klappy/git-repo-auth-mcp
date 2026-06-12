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
