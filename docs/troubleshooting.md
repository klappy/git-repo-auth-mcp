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

## Token genuinely rejected (all requests 401, rate limit says 60)

Not yet field-observed, but the expected causes in likelihood order: the token expired (≤1 hour by design — mint a fresh one, expiry *is* the rotation); the app was uninstalled from the account (the user's kill switch — minting ends instantly); or the requested repo/permission is outside what the installation granted (the `github_token` call itself errors in that case — see README "Per-request enforcement").

When an entry here graduates from "expected" to "observed," date it and link the journal entry.

---

## Adding entries

When you hit and resolve a failure: record the observation in the project journal first (dated DOLCHEO entry under `odd/ledger/`), then distill it here — symptom as the heading, cause, fix, verification step, journal link. The journal is the evidence; this doc is the index into it.
