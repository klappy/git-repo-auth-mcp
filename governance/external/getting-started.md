# Getting Started

Never given an AI system real access to your repos before? This is the walkthrough. You have a free bucket of 50 token mints — enough to genuinely experience it, no card required.

## The two-minute path

1. **Connect.** Add this server to your MCP client (`https://<deployment>/mcp`). Your client walks you through GitHub login and installing the GitHub App on whichever repos you choose. You control the scope; GitHub enforces it.
2. **Make a sandbox.** First time? Don't start on something precious. Create a fresh repository — [github.com/new](https://github.com/new) — name it anything (`agent-playground` works). Install the app on just that repo.
3. **Tell your agent the repo name.** Then ask for something real: "clone agent-playground, scaffold a small site, and open a PR." The agent calls `github_token` itself; you never touch a credential.
4. **Watch the PR arrive.** Commits land under the app's `[bot]` identity, tokens die within the hour, and your kill switch is always one click: uninstall the app.

## What to try with your 50 mints

- Point it at an old project and ask for a code review PR.
- Have it triage your open issues and draft fixes.
- Run two agents on two repos at once and feel what concurrency buys.

## When the bucket runs out

That's the signal you've felt it. `remaining` counts down on every mint; at zero, the response carries an upgrade link. Tiers are priced on how many agents you want working at once — see `tiers.md`, which your agent can fetch through the `docs` tool and explain to you.
