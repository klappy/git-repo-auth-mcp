# Write Verbs — Landing Work Through the Token, Not the Sandbox

*Drafted 2026-09-05. Will be served by the `docs` tool once registered in `src/docs.ts`; until then, read it in the repo.*

## Why

Some seats run in a sandbox that can read a repo over git but cannot reach `api.github.com` directly — proxy-walled off the network the write would need. `github_token` alone doesn't help there: it hands back a token, but the token is only useful if the caller can talk to GitHub with it. The write verbs move the network hop inside the Worker instead — the seat calls the MCP tool, the Worker mints the scoped installation token itself and makes the GitHub REST calls, and only the result (a sha, a PR number) comes back. This is the fix for the recurring **Cowork no-sources case**: a Cowork seat with no outbound path to `api.github.com` could read via git but repeatedly failed to push or open a PR, because there was nowhere in its sandbox for a minted token to do anything with. Landing the request server-side removes that dependency entirely.

## The three verbs

### `git_put` — write one commit

| Input | Type | Notes |
|---|---|---|
| `repo` | string | `"owner/name"`, must be inside this connection's installation grant |
| `branch` | string | Created from `base` if absent, else updated |
| `base` | string, optional | Defaults to the repo's default branch |
| `message` | string | Commit message |
| `files` | array | Each entry: `path`, `content`, optional `from_path` (rename+edit), optional `mode`, optional `encoding` |

| Output | Type | Notes |
|---|---|---|
| `sha` | string | New commit sha |
| `branch` | string | Branch written to |
| `blob_urls` | array | One per file written |

### `git_move` — move or rename a path

Tree-level rename: the blob content is never re-uploaded, only relinked at the new path, in one commit.

| Input | Type | Notes |
|---|---|---|
| `repo` | string | `"owner/name"`, must be inside this connection's installation grant |
| `branch` | string | Must already exist — a move needs somewhere to move *from* |
| `from` | string | Path to move; end with `/` to move every entry under that directory |
| `to` | string | Destination path (mirror the trailing `/` for a directory move) |
| `message` | string | Commit message |

| Output | Type | Notes |
|---|---|---|
| `sha` | string | New commit sha |
| `branch` | string | Branch written to |
| `from` / `to` | string | Echoed back for confirmation |

### `pr_open` — open a pull request

| Input | Type | Notes |
|---|---|---|
| `repo` | string | `"owner/name"`, must be inside this connection's installation grant |
| `head` | string | Branch containing the changes (`owner:branch` for a fork) |
| `base` | string | Branch the PR merges into |
| `title` | string | PR title |
| `body` | string | PR description |
| `draft` | boolean, optional | Default `true` |

| Output | Type | Notes |
|---|---|---|
| `number` | number | PR number |
| `html_url` | string | Link to the PR |
| `draft` | boolean | Whether it opened as a draft |
| `assignee_warning` | string, optional | Present only if the PR landed but assigning the operator failed |

## Scope law: your grant, not wider

Every write verb mints its own token, scoped to exactly the named repo — never the whole installation:

- `git_put` and `git_move` mint `contents:write` on the named repo only.
- `pr_open` mints `contents:read` + `pull_requests:write` on the named repo only.

The installation grant is the hard ceiling GitHub enforces underneath that mint. If the repo isn't in the grant, or the App lacks the needed permission on it, the mint itself fails (404/422) and the call is refused by name — naming the missing repo and the missing permission — never silently dropped and never reported as landed. The same rule holds downstream: any non-`ok` response from a GitHub REST call (creating a blob, updating a ref, opening the PR) is refused with the failing step named, not swallowed or mistaken for success. A 403 or 404 from GitHub is a refusal, never a landing.

## Attribution

Author and committer are the CONNECTED login's `{id}+{login}@users.noreply.github.com`, id read live from GitHub per call (the ARS service path connects as `ARS_SERVICE_ACCOUNT`); if the lookup fails the verb refuses rather than committing as the bot.

```
author.email    = committer.email = {id}+{login}@users.noreply.github.com
author.name     = committer.name  = {login}
```

The id is never typed or cached — it is read fresh on every call. If the lookup fails, the call refuses (`identity_resolution_failed`) rather than falling back to committing as the bot.

`pr_open` does not stamp commit identity (a PR has no commits of its own to author), but when `OPERATOR_LOGIN` is configured for the service, it assigns that login to the opened PR for visibility — assignment only, never a review request.

## Audit line format

Every call — landed or refused — logs exactly one JSON line, and the token is never one of the fields:

```json
{"verb": "git_put", "login": "...", "repo": "owner/name", "outcome": "landed", "branch": "...", "paths": ["..."], "sha": "..."}
```

`verb`, `login`, `repo`, and `outcome` (`"landed"` or `"refused"`) are present on every line. The remaining fields vary by verb and outcome: `git_put` adds `branch`, `paths`, `sha` on landing; `git_move` adds `branch`, `from`, `to`, `sha`; `pr_open` adds `number`, `head`, `base`. A refused call adds `reason` (e.g. `repo_not_granted`, `identity_resolution_failed`, `quota_exceeded`, `from_not_found`, `mint_error`) in place of the landing fields. A mint failure logs `reason: "mint_error"` with no error body and no token.

## Not supported

- **Force push** — every ref update is a fast-forward (`force: false`); a write verb never rewrites history on a branch.
- **Direct writes to `main`** are refused unless every written path is under `rail/` or `journal/` (refusal reason `main_requires_rail_path`, checked before any mint or GitHub call, for both `git_put` and `git_move`). Everything else goes to a feature branch and `pr_open`. Merging is the expeditor's, never a verb's.
- **Merging a pull request** — these verbs open PRs, they don't merge them. Merging is an expeditor action.
- **Requesting review** — `pr_open` will assign the configured operator for visibility, but never calls the requested-reviewers endpoint. Ask for a review deliberately, outside these verbs, when one is actually wanted.

## Quota

Each write-verb call mints exactly one token — same metering, same tiers, and the same quota-exceeded response shape as `github_token` (see `tiers.md` and `quota-transparency.md`). A cached, still-live token for the same scope is reused for free; a failed mint (dead installation, permissions mismatch, GitHub outage) is never charged.
