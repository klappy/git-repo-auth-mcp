# Review — Write Verbs (`git_put`, `git_move`, `pr_open`)

*2026-09-05. Head `ac84698` on `dish/2026-09-05-gitauth-write-verb`, this commit on top.*

## Scope

Files changed: `src/write-verbs.ts` (the three verbs, rail gate, attribution, audit), `docs/write-verbs.md`, `CHANGELOG.md`, `streams/2026-09-05-write-verb.stream.md`.

## Proof

- `npx vitest run` — 78 passed | 9 skipped (10 files passed, 1 skipped).
- `npx tsc --noEmit` — clean.

## Validation findings folded into the doc

- Rail gate: `main` accepts direct writes only under `rail/**` or `journal/**`; checked synchronously before any mint or GitHub call, shared by `git_put` and `git_move` (refusal reason `main_requires_rail_path`).
- `pr_open` partial landing: if the PR is created but assigning the operator fails, the call still reports `landed` with `number` and `html_url`, plus an `assignee_warning` — never a refusal that hides an existing PR.
- `draft` defaults to `true` (the doc's input table previously said `false`, stale — corrected).
- Audit on mint error: `outcome: "refused"`, `reason: "mint_error"`, no error body, no token, ever logged.
- Mint-args asserted exactly: `contents:write` for `git_put`/`git_move`, `contents:read` + `pull_requests:write` for `pr_open`, scoped to the one named repo.
- Attribution resolves to the CONNECTED login (from the OAuth grant, `props.login`), not an input field; id read fresh via `GET /users/{login}` on every call, never cached; failure refuses rather than falling back to the bot identity.
- `base64` encoding and the `mode` enum (`100644`/`100755`) on `git_put` files match the implementation.

## Spec drifts recorded

- Author/committer identity is resolved from the connection's grant (`props.login`), not from a request input — safer by construction, since a caller can't spoof a different attribution by passing a different login.
- `docs` tool registration for `write-verbs.md` is still owed (`src/docs.ts`); until then the file is read directly from the repo.

## Remaining

- Live proof from a no-sources Cowork session: a `journal/` row landing on `klappy/kitchen` main, and a draft PR opening on `klappy/klappy.dev`.
- Wire `docs/write-verbs.md` into `src/docs.ts`.

## Rollback

Revert this commit.
