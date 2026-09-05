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
