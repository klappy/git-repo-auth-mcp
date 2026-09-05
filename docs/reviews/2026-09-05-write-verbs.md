# Review — gitauth-write-verb (2026-09-05)

**Branch:** `dish/2026-09-05-gitauth-write-verb` @ `074c51b`
**Ticket:** kitchen/rail/1-ordered/2026-09-03-gitauth-write-verb

## What changed

- `src/write-verbs.ts` — `git_put`, `git_move`, `pr_open` MCP tools: mint a repo-scoped installation token server-side (`contents:write` for the first two, `contents:read` + `pull_requests:write` for `pr_open`), call the GitHub REST API from the Worker, and return only the result (sha / PR number) to the caller.
- `src/mcp-api.ts` — wired via `registerWriteVerbs(server, env, props, ctx)`.
- `test/write-verbs.test.ts` — happy path and refusal coverage for all three verbs, plus token-absence assertions.
- `streams/2026-09-05-write-verb.stream.md` — running checkpoint across all four slices.
- `CHANGELOG.md` — Unreleased entries per slice.
- (this slice) `docs/write-verbs.md`, `docs/reviews/2026-09-05-write-verbs.md`.

## Why

Ticket `kitchen/rail/1-ordered/2026-09-03-gitauth-write-verb`, fired by the captain after the 4th Cowork casualty: a seat could read a repo over git but repeatedly failed to push or open a PR, because its sandbox is proxy-walled off `api.github.com` — a minted token had nowhere to be used. The cure is to move the write itself inside the Worker: the seat calls an MCP tool, the Worker holds the token and makes the GitHub calls, only the outcome comes back.

## How proven

- `npx vitest run` — **72 passed | 9 skipped** (verified by dispatcher at `074c51b`).
- `npx tsc --noEmit` — clean (verified by dispatcher at `074c51b`).
- Coverage: mint-scope-per-verb, repo-not-granted refusal (naming the repo/permission), identity-resolution refusal, `from_not_found` on `git_move`, token absent from both the tool response and the audit log, `pr_open` assignee call observed without ever hitting `requested_reviewers`.

## Validation findings folded (slice 3)

- **Attribution** — author/committer now resolved live via `GET /users/{login}` and stamped as `{id}+{login}@users.noreply.github.com` on every commit-producing verb, instead of falling through to the App bot identity.
- **Audit-on-refusal** — every refusal path now logs the same audit row shape as a landing (`verb`, `login`, `repo`, `outcome: "refused"`, `reason`), so refusals are as visible in the log as landings, not just a thrown error.
- **Binary content** — `files[].encoding` (`utf-8` default, `base64`) so non-text files can be written without corruption.
- **Mode enum** — `files[].mode` constrained to `"100644" | "100755"` rather than an open string, closing off invalid git modes at the schema layer.
- Test hardening on the mint call args (asserting the exact `permissions` object passed to `auth()` per verb, not just the outcome).

## What remains

- **Live proof from a real no-sources Cowork session** is still owed to the dispatcher: a `git_put` landing a journal row on `klappy/kitchen` main, and a `pr_open` opening a draft PR on `klappy/klappy.dev`, run from a seat that genuinely cannot reach `api.github.com` — the exact failure mode this ticket exists to fix. Nothing in the test suite substitutes for that end-to-end run.
- **`docs` tool registration** — `docs/write-verbs.md` is not yet wired into the `DOCS` registry in `src/docs.ts` (bundled import + catalog entry), so the `docs` tool cannot yet resolve a "write verbs" query to this file. That registry edit touches `src/`, which is out of scope for this docs-only, 10-minute slice; it is a small, mechanical follow-up for whichever slice is allowed to touch `src/docs.ts` next.

## Rollback

Revert this branch's commits. No migrations, no stored state introduced — the write verbs mint tokens per call and log audit lines; there is nothing to unwind beyond the code itself.
