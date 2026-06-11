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
