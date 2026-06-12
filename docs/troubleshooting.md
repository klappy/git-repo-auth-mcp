# Troubleshooting

Field-observed failures and their fixes. Every entry here traces back to a dated observation in the project journal (`odd/ledger/`) — symptoms first, because that's what you'll be searching for.

---

## "Requires authentication" (401) on GitHub API POST, but the token works

**Symptom.** A token minted by `github_token` succeeds on GET requests but a POST (e.g. creating a PR via `POST /repos/{owner}/{repo}/pulls`) returns `401 {"message":"Requires authentication"}`. Both `Authorization: Bearer <token>` and `Authorization: token <token>` fail identically.

**Cause.** The request body, not the token. GitHub reports some malformed-request conditions as **401, not 400/422**. The common trap: `curl --data` defaults to `Content-Type: application/x-www-form-urlencoded`, so a JSON body arrives mislabeled and GitHub rejects the request as unauthenticated. The error message points you at the token; the token is innocent.

**Fix.** Send the header explicitly:

```sh
curl -X POST https://api.github.com/repos/OWNER/REPO/pulls \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data-binary @body.json
```

**How to confirm it's not the token.** One cheap, side-effect-free check:

```sh
curl -s -D- -o /dev/null https://api.github.com/rate_limit \
  -H "Authorization: Bearer $TOKEN" | grep -i x-ratelimit-limit
```

- `x-ratelimit-limit: 8100` (or similar high value) → authenticated GitHub App context. Token is fine; debug your request.
- `x-ratelimit-limit: 60` → anonymous. Token isn't reaching GitHub (expired ≤1h lifetime, stripped header, typo).

**Why this doc exists in this repo specifically.** This bridge's whole job is minting tokens, so "the token doesn't work" is the bug report it will attract most. This failure mode looks exactly like a minting bug and isn't one. Check the request before filing an issue against the worker.

*Observed 2026-06-10 — journal: `odd/ledger/2026-06-10-minted-seal-branding.md`.*

---

## "Where's the PR?" — agent-created PRs don't appear in your GitHub app filters

**Symptom.** An agent opened a PR using a token from `github_token`, but it's missing from your GitHub mobile/web filters: "Created by me" is empty, "Involved" is empty, and you need a direct link to find it.

**Cause.** Working as designed, then under-finished. PRs created with installation tokens are authored by the app's bot identity (e.g. `git-repo-auth[bot]`) — that's the audit-trail provenance the security model promises. But bot authorship means *you* match none of GitHub's "my PRs" filters until you're explicitly attached to the thread.

**Fix.** Have the agent attach you at creation time — two calls, both needing `pull_requests: write`:

```sh
curl -X POST https://api.github.com/repos/OWNER/REPO/issues/N/assignees \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"assignees":["YOUR_LOGIN"]}'
curl -X POST https://api.github.com/repos/OWNER/REPO/pulls/N/requested_reviewers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reviewers":["YOUR_LOGIN"]}'
```

The PR then appears under your "Assigned to me" and "Review requested" filters, and you get the review-request notification. Bot provenance stays in the author field, where it belongs.

*Observed 2026-06-10 — journal: `odd/ledger/2026-06-10-minted-seal-branding.md`.*

---

## Token genuinely rejected (all requests 401, rate limit says 60)

Not yet field-observed, but the expected causes in likelihood order: the token expired (≤1 hour by design — mint a fresh one, expiry *is* the rotation); the app was uninstalled from the account (the user's kill switch — minting ends instantly); or the requested repo/permission is outside what the installation granted (the `github_token` call itself errors in that case — see README "Per-request enforcement").

When an entry here graduates from "expected" to "observed," date it and link the journal entry.

---

## Upcoming: longer stateless installation tokens (~520 chars) — heads-up, not yet observed

**What's changing.** GitHub has announced that App installation tokens will move to a new stateless format — still `ghs_`-prefixed, but potentially much longer (~520 characters). Per the announcement (see the GitHub Changelog at https://github.blog/changelog/), apps with hardcoded length assumptions may break; a per-request override header is offered for validating ahead of the rollout.

**Why this bridge is expected to be unaffected (code audit, 2026-06-11).** The worker carries no format or length assumptions: no token regexes, no `.length` checks, no truncation anywhere in `src/`. The token is a pure pass-through from GitHub to the tool result (`src/mcp-api.ts`), and only its **expiry timestamp** is ever stored (`quota:tok` records, `src/quota.ts`) — the no-tokens-stored promise means there is nothing to overflow. Downstream usage formats (`x-access-token:<token>@` clone URLs, `Authorization: Bearer` headers) are length-agnostic.

**The unverified seam.** `@octokit/auth-app` performs the token-creation call and caches tokens internally. It treats tokens as opaque strings and *should* be unaffected — but that is expectation, not observation. Verification path: inject GitHub's override header on the token-creation request (a temporary, env-flagged patch, since the call lives inside octokit), then run one mint and one clone against the forced new format.

**Symptom if it ever bites.** Mints failing after GitHub's rollout with no code change on our side. Check `@octokit/auth-app` release notes before suspecting the worker.

**Tripwires** (Bide verdict: `waiting`): GitHub announcing an enforcement date, or an `@octokit/auth-app` release referencing the new format. Either fires → run the override-header test above.

---

## Adding entries

When you hit and resolve a failure: record the observation in the project journal first (dated DOLCHEO entry under `odd/ledger/`), then distill it here — symptom as the heading, cause, fix, verification step, journal link. The journal is the evidence; this doc is the index into it.
