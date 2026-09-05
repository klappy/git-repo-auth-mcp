# 2026-09-05 — gitauth-write-verb, slice 1: `git_put`

- 16:2x — Ticket fired by captain after 4th Cowork casualty (door can read via git but can't push/PR: sandbox proxy walls api.github.com). Cure: write rides the GitAuth token inside the Worker, not the seat's sandbox.
- Branch: `dish/2026-09-05-gitauth-write-verb`.
- Read `src/mcp-api.ts` (github_token mint pattern via createAppAuth + checkMint), `src/quota.ts` (charge-at-check/refund-on-fail contract), `test/quota.test.ts` + `test/service-auth.test.ts` for harness/stub style.
- No "interim operator-only lockdown gate" found present on main for /mcp write paths (only `isOperator` gating `admin_stats`, and the separate ARS `isServiceRequest` machine-credential path) — brief said apply it "if present"; nothing to wire.
- No `Chris Klapp <klappy@users.noreply.github.com>` commit found anywhere in `git log --all`; only author of record is `git-repo-auth[bot]`. Used the brief's specified identity for this commit's trailers as instructed, flagging the mismatch here rather than silently inventing or silently overriding the brief.
- Implemented `git_put` in `src/write-verbs.ts`: mint (repo-scoped `contents:write`, same `checkMint`/`refundMint` metering) → resolve base branch → create branch ref if absent → blobs+tree+commit (git database API, uniform path regardless of file count) → update ref. Explicit refusal on repo-not-granted (404/422 from the mint call) and on any non-ok GitHub REST response (never swallowed as landed). Token never returned or logged; one audit line via `console.log({verb:"git_put",...})` without the token.
- Wired into `src/mcp-api.ts` via `registerWriteVerbs(server, env, props, ctx)`.
- Tests: `test/write-verbs.test.ts` — happy path (2 files → 1 commit → sha), refusal naming the ungranted repo, token absent from both the response and the audit log. Mocks `@octokit/auth-app` and stubs `fetch` for `api.github.com`.
- `git_move` and `pr_open` (slices 2–3) not built — out of scope for this slice per brief.

# 2026-09-05 — gitauth-write-verb, slice 2: `git_move` + `pr_open`

- Continuation on the same branch (`dish/2026-09-05-gitauth-write-verb` @ 794dc68, slice 1 PASS). Reused `git_put`'s mint/scope/refusal/audit style exactly — same `checkMint`/`refundMint` metering, same repo-not-granted catch on the `auth()` call, same `console.log({verb, ...})` audit row without the token.
- `git_move`: resolves the existing branch tip (no create-if-absent — a move needs somewhere to move *from*), reads the full recursive tree at that commit, matches `from` either exactly (file) or by prefix (directory, when `from` ends with `/`), and relinks each matched blob sha at its new path in one new tree + commit — no blob re-upload. Explicit refusal, naming the path, when `from` matches nothing on the branch.
- `pr_open`: mints `{contents:"read", pull_requests:"write"}`, POSTs `/pulls`, then — only when `OPERATOR_LOGIN` is configured for the service (read from env, never typed) — POSTs `/issues/{number}/assignees` with that login. Never calls the requested-reviewers endpoint. Repo-not-granted refusal reuses the same 404/422-on-mint catch, now naming `pull_requests:write` in the hint.
- Tests appended to `test/write-verbs.test.ts`: `git_move` happy path (rename, one commit, sha returned) and refusal on a nonexistent `from`; `pr_open` happy path (assignee call observed via the fetch mock's call list, no `requested_reviewers` URL ever hit) and refusal when the mint 404s for `no-grant`. All token-absence assertions carried over.
- `npx tsc --noEmit` clean; `npx vitest run` — 67 passed, 9 skipped (up from 63 passed at end of slice 1).
- `docs/write-verbs.md` and the review doc intentionally not touched — slice 3.
