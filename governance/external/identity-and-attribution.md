# Identity & Attribution — Putting the Operator on the Work

*Drafted 2026-06-18. Served via the `docs` tool once merged.*

Commits and pull requests an agent creates with a minted token are attributed two different ways, by two different mechanisms. Confusing them is what makes "everything shows up as the bot" feel unfixable. Pulled apart, most of it is fixable today, with the token you already hold and nothing stored.

- **Commit attribution** is by **email**. GitHub matches a commit's author/committer email to a user account. The token that pushed it is irrelevant to whose avatar appears on the commit.
- **PR authorship** ("opened by") is by **token identity**. An installation token opens PRs as the App's `[bot]` user. No email trick changes that line — it is a property of the token type.

So: commit credit is yours for the taking; PR "opened by" stays the bot unless a human clicks once. Here is how to get the operator onto the work without minting anything different and without storing a credential.

## Commits in the operator's name

GitHub attributes a commit to an account when the author email is one the account owns — including its **no-reply address**, which always has the form:

```
{user_id}+{login}@users.noreply.github.com
```

The agent already holds a token. Resolve the operator's numeric id with it, then stamp the commit:

```
GET /users/{login}        ->  read the "id" field
```

```
GIT_AUTHOR_NAME="{login}"
GIT_AUTHOR_EMAIL="{id}+{login}@users.noreply.github.com"
GIT_COMMITTER_NAME="{login}"
GIT_COMMITTER_EMAIL="{id}+{login}@users.noreply.github.com"
```

The commit now lands on the operator's profile and contribution graph, their avatar on every line — using only the installation token. Nothing is stored, no promise is bent. (The agent that pushed remains the *pusher* in the repo's event log, which is honest and separate from authorship.)

If you don't know the operator's `{login}`, ask once and reuse it for the session. The numeric id you resolve yourself.

## Co-authors — sharing the credit honestly

When the bot did the work and the operator directed it — or two parties collaborated — record both with a trailer. Leave one blank line, then:

```
Co-authored-by: {login} <{id}+{login}@users.noreply.github.com>
```

Trailers attribute on the contribution graph but are **not** a PR-visibility signal — they don't put the PR in anyone's filters. Use them for credit, not for surfacing.

## Make the PR visible to the operator

This is the lever that actually solves "GitHub never shows me PRs the agent opened." GitHub's PR/issue filters key on participation, not authorship. After opening the PR, do all three — each feeds a different filter:

```
POST /repos/{owner}/{repo}/issues/{number}/assignees      {"assignees":["{login}"]}    -> "Assigned"
POST /repos/{owner}/{repo}/pulls/{number}/requested_reviewers  {"reviewers":["{login}"]} -> "Review requests"
```

…and `@{login}` in the PR body — feeds "Mentioned". All three also roll up into the "Involved" filter, so the PR stops being invisible the moment it exists. (Request review from the operator only when they're a collaborator on the repo and not the PR author; the bot is the author here, so the operator is eligible.)

## What stays the bot — and the honest workaround

The PR's "opened by" line stays `[bot]`, because the installation token carries the bot identity and that is the only token this service mints without holding a credential past login. Two consequences to be straight about:

- **Verification.** A commit authored as the operator's no-reply but pushed with the installation token shows their identity; whether it carries a "Verified" badge depends on how it was created and is not guaranteed. Attribution and signature verification are separate things.
- **Author-matched tooling.** Review bots on individual plans (e.g. some configurations of Cursor Bugbot) trigger on the *PR author*. A bot-authored PR may not wake them no matter how the commits are attributed or who is assigned. Assignment fixes *your* visibility; it does not change the author the bot sees.

When the operator wants the PR to be **genuinely theirs** — author-matched tooling and all — the promise-keeping path is the one-click handoff in `getting-started.md`: the agent pushes the branch and hands back

```
https://github.com/{owner}/{repo}/pull/new/{branch}
```

A PR opened from that link is authored by the operator, with the agent's commit history intact underneath. One click, nothing stored, every wall standing.

## Agent recipe (copy/paste)

1. Resolve id: `GET /users/{login}` → `id`.
2. Commit with author **and** committer set to `{id}+{login}@users.noreply.github.com`.
3. Push the branch with the minted write token (`x-access-token:<token>`).
4. Either open the PR and then assign + request-review + `@`-mention the operator, **or** hand back the `pull/new/{branch}` link so the operator opens it themselves.
5. Prefer the handoff link whenever author-matched tooling matters; prefer direct-open + assignment when bot authorship is fine and you just want the operator to see it.
