# Write Verbs — Landing Work Through the Token, Not the Sandbox

*Drafted 2026-09-27. Served via the `docs` tool. Contract first; the verbs ship behind it.*

A seat that can mint a token can also **land** work — put files on a branch, move a path, open a draft PR — without ever holding a git remote itself. The write rides the token, server-side. This exists because a sandbox's network egress to GitHub is decided before the seat learns which repos it needs; the verbs make that ordering irrelevant.

Three verbs. Same installation binding, same permission ceiling, same quota as `github_token`. Nothing here is wider than what `github_token` could already mint.

## The verbs

| Verb | Input | Does | Returns |
|---|---|---|---|
| `git_put` | `{repo, branch, base?, files[{path, content \| from_path, mode?}], message, author}` | Creates `branch` from `base` (default: the repo's default branch) if it does not exist, writes the files as **one commit** on `branch`. | `{sha, branch, blobs[{path, url}]}` |
| `git_move` | `{repo, branch, from, to, message}` | One commit on `branch` that drops `from` and adds `to` with the same blob — `git mv` as a tree edit. | `{sha, branch}` |
| `pr_open` | `{repo, head, base, title, body, draft}` | Opens the pull request (`draft` defaults to `true`), assigns the operator, requests no review. | `{number, url, draft}` |

A verb either returns a sha (or a PR number) or an explicit refusal. There is no third outcome: a GitHub 404/403 is surfaced with its status, never reported as "landed".

## Scope law — mint-scope equals write-scope

1. **Required permissions per verb**: `git_put` and `git_move` need `contents: write`; `pr_open` needs `pull_requests: write` (and `contents: read` to resolve `head`). The verb mints exactly that, down-scoped to `repo`. Nothing wider.
2. **Ceiling is the grant.** If the installation does not grant a required permission, or does not include `repo`, the verb **refuses before minting** and names what is missing — `missing: ["contents:write"]` — so the fix is legible from the refusal alone.
3. **The seat never sees a credential.** The token is minted inside the call and discarded when the call returns. It is not in the response, not in the audit row, not in logs. (R4: credentials never enter model context.)
4. **Main is protected for cargo.** A `git_put` or `git_move` whose `branch` is the repo's default branch is allowed only when **every** path is under the rail allowlist — `rail/**` or `journal/**`. Any other path on main is refused with `refusal: "main_protected"` and the offending paths. Cargo goes on a `dish/<ticket>` branch and reaches main through a PR (R16: only the expeditor merges).
5. **No merge verb.** There is deliberately no `pr_merge`. Merging stays with the human or the expeditor seat holding the merge token.

## Refusal cases

| Refusal | When | Response |
|---|---|---|
| `missing_permission` | grant lacks a permission the verb needs | `{error:"refused", refusal:"missing_permission", missing:["contents:write"]}` |
| `repo_not_granted` | `repo` is not in the installation's repository selection | `{error:"refused", refusal:"repo_not_granted", repo}` |
| `main_protected` | default branch + any path outside `rail/**`, `journal/**` | `{error:"refused", refusal:"main_protected", paths:[…]}` |
| `quota_exceeded` | same wall as `github_token` | same shape as `github_token`'s quota wall |
| `upstream_<status>` | GitHub answered non-2xx after the mint | `{error:"upstream", status, step}` — no sha, never "landed" |

Refusals cost nothing against quota; a refused verb mints nothing.

## Audit row

Every call — landed or refused — writes one line to the service log:

```
audit verb=git_put login=<operator> repo=<owner>/<repo> branch=<branch> paths=<n>:<p1>,<p2>,… outcome=landed sha=<sha>
audit verb=git_put login=<operator> repo=<owner>/<repo> branch=main paths=1:src/x.ts outcome=refused refusal=main_protected
```

Fields: `verb`, `login`, `repo`, `branch`, `paths` (count then list, `git_move` lists `from>to`), `outcome`, then `sha` or `refusal`. Never a token, never file content, never `content` or `from_path` bodies. A grep for `ghs_` or `Bearer` across audit rows returns nothing by construction — the row is built from the request shape and the outcome, not from the credential.

## Attribution

`author` on `git_put`/`git_move` is `{name, email}`; use the operator's no-reply address so the commit shows the operator, not the bot — see "identity-and-attribution". `pr_open` assigns the operator and does not request review, per the same document.

## What this is not

- Not a way past the installation grant. The verbs can refuse; they cannot widen.
- Not a merge. Not a force-push. Not a branch delete. Ref updates are fast-forward only.
- Not a place to store the token. Nothing is persisted per call except the audit row.
