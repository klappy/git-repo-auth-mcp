# Identity & Attribution — Putting the Operator on the Work

*Drafted 2026-06-18. Served via the `docs` tool.*

Commits and pull requests an agent creates with a minted token are attributed two different ways, by two different mechanisms. Confusing them is what makes "everything shows up as the bot" feel unfixable. Pulled apart, most of it is fixable today, with the token you already hold and nothing stored.

- **Commit attribution** is by **email**. GitHub matches a commit's author/committer email to a user account. The token that pushed it is irrelevant to whose avatar appears on the commit.
- **PR authorship** ("opened by") is by **token identity**. An installation token opens PRs as the App's `[bot]` user. No email trick changes that line — it is a property of the token type.
- **PR findability** (whether the operator sees it in their GitHub lists) is by **participation** — assignee, mention, requested reviewer. It is *not* affected by who authored the commits.

## Commits in the operator's name

GitHub attributes a commit to an account when the author email is one the account owns — including its **no-reply address**:

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

The commit now lands on the operator's profile and contribution graph using only the installation token. Nothing is stored, no promise is bent. The agent that pushed remains the *pusher* in the event log — honest and separate from authorship.

## Co-authors — credit, not findability

To share credit, add a trailer (one blank line, then):

```
Co-authored-by: {login} <{id}+{login}@users.noreply.github.com>
```

Trailers attribute on the contribution graph. They are **not** a findability signal — a co-authored PR does **not** appear in the operator's filters because of the trailer. Use them for credit only.

## Make the PR findable — assign first

GitHub's PR/issue filters key on participation. The levers, ranked by cost to the operator:

- **Assign the operator** — primary lever, zero obligation. Puts the PR in their **Assigned** filter and rolls into **Involved**. An assignment is a pin, not a task to clear.
  ```
  POST /repos/{owner}/{repo}/issues/{number}/assignees   {"assignees":["{login}"]}
  ```
- **`@`-mention in the body** — *optional*. Adds the **Mentioned** filter plus a notification. Use when you want to actively ping, not just surface.
- **Request review** — *opt-in only*. Adds **Review requests** **and** creates a review obligation the operator must act on. Do **not** do this by default; only when you actually want them to review.
  ```
  POST /repos/{owner}/{repo}/pulls/{number}/requested_reviewers   {"reviewers":["{login}"]}
  ```

Default to **assign alone** (+ mention if you want to ping). Assignment alone is enough to make the PR findable with no extra work for the operator.

## PR authorship stays the bot — what that means for review bots

The "opened by" line stays `[bot]` — installation-token physics. Whether a review bot will touch a bot-authored PR depends on the plan. For **Cursor Bugbot** specifically (verified June 2026):

- **Individual plan:** Bugbot runs *only on PRs you author*. A bot-authored PR never auto-triggers — `bugbot run` on it no-ops. To get a review, use the **one-click handoff**: the agent pushes the branch and hands back
  ```
  https://github.com/{owner}/{repo}/pull/new/{branch}
  ```
  The operator opens the PR from that link, so *they* are the author — which both makes the PR genuinely theirs **and** wakes Bugbot.
- **Teams plan:** Bugbot runs for *all contributors regardless of membership*. Bot-authored PRs auto-review on open — no handoff, no comment, no reopen. (Confirmed on a fresh `[bot]`-authored PR.)
- **Billing watch (Teams):** seats are counted per "user who authored PRs reviewed by Bugbot," and there is a pooled 200-PR/license cap. How a `[bot]` author is seat-counted is undocumented — monitor the dashboard/invoice.

For *any* AI eyes on a bot-authored PR without re-authoring, a **human-posted** `@cursoragent review` spawns a Cursor Cloud Agent review (a different product from Bugbot; a bot-posted trigger is ignored).

## Agent recipe (copy/paste)

1. Resolve id: `GET /users/{login}` -> `id`.
2. Commit with author **and** committer = `{id}+{login}@users.noreply.github.com`.
3. Push the branch with the minted write token (`x-access-token:<token>`).
4. Surface it: **assign the operator** (+ optional `@`-mention). Request review only if a review obligation is actually wanted.
5. Review tooling: on **Teams**, open the PR directly — Bugbot auto-runs. On **Individual**, hand back the `pull/new/{branch}` link so the operator authors it (makes it theirs *and* triggers Bugbot).
