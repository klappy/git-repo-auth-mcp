# Otto — standalone implementation partial review

2026-09-07T20:32:08Z. Read-only advisory review while the sole author is still editing `account-standalone-recovery`. **Not frozen source acceptance.**

Found and independently executed the ordinary missing-cookie race: a same-browser GET /account/signin carrying no continuation cookie arrives after a newer live continuation and its Pending have been created. The partial ordinary `begin(..., undefined, false)` did not inspect the slot, so it replaced the live Pending and returned HTTP200. The original captured nonce/ref then failed actual `store.start`. Explicit restart snapshot checks did not protect this ordinary path.

Executed `npx vitest run tests/native-access/otto-partial-missing-cookie-review.test.ts` in `otto-account-review`: **1FAIL, exit1**, at approximately20:31:48Z. Expected `{status:503, clearsContinuation:false, livePendingSurvives:true}`; received `{status:200, clearsContinuation:false, livePendingSurvives:false}`. Actual partial routes/store snapshots with synthetic in-memory transactional storage and binding adapter; not native workerd or browser-network timing proof.

Reviewer-only preserved snapshots under `/workspace/scratch/b1f4e4a310e1/otto-account-review/`:

- `account/partial-restart-browser-review.ts`: SHA256 `391f15e2af264e0a0176d6771e29ff00c81d7f79ae4b9e5995be0c047da5f295`;
- `account/partial-restart-routes-review.ts`: SHA256 `e044cd97ce5f10cf8f33400b12e041291641920960535e72a0e855c1b9e9b4af`;
- `tests/native-access/otto-partial-missing-cookie-review.test.ts`: SHA256 `4fcb8cc22be12a98acd905d2080def6d17f2eaf966222f0fd3e22dd82fa5cc70`.

Actionable finding sent directly to author and coordinator: ordinary unbound begin must atomically deny an existing slot; true absence must acquire its own captured absence/revision guard through start, consume and final activation, so a replacement arriving after begin cannot be invalidated either. Ordinary mode must remain ordinary—not silently become explicit restart. Required route and paused-provider regressions include live replacement and absent-slot ABA.

Author subsequently reported implementing exactly that separate `Pending.unbound` guard and adding native coverage. That report is **attributed and not verified by this partial receipt**. Frozen successor review must independently verify source and execute the affected negative. Product source was not edited by Otto.

## Exact stable partial 4ad8 — independently verified repair, new corruption blocker

Cloned the author's repository read-only into `/tmp/otto-standalone-4ad8-review`, checked out exact `4ad8eb419d41315e3043420aeea19019b9a624d3`, and added only an untracked reviewer test plus a dependency symlink. Author source remained untouched. Compared the then-current author runtime with 4ad8 and found no delta; all execution below used the isolated exact checkout.

At approximately20:34:13Z, independent reviewer suite **7PASS, exit0**: the original missing-cookie actual-route failure now returns503 and preserves the existing Pending; six new actual-store cases cover replacement and absent-slot ABA at start, consume and final activation. All storage other than permitted activation-proof cleanup is asserted unchanged on rejection. `Pending.unbound` remains distinct from explicit restart mode. These are synthetic transactional storage/binding tests, not native workerd/provider proof.

Root then identified a separate strict-absence edge. Independently confirmed `terminal()` uses `if (!raw) return undefined`. Expanded reviewer suite at approximately20:34:49Z: **11PASS / 8FAIL, exit1**. Persisted `null`, empty string, numeric0 and false each wrongly permit both ordinary and explicit restart begin. Object and array reject. A missing storage entry (`undefined`) alone may be classified as absence; stored malformed data must deny. Exact finding and correction sent directly to author while the fire remains active.

**HOLD exact4ad8 pending strict absence correction and successor verification.** The passing replacement repair is not retracted; it does not waive malformed-storage requirements. Reproducer `/tmp/otto-standalone-4ad8-review/tests/native-access/otto-missing-cookie-review.test.ts`, SHA256 `328d9e1f27cf4e429a2dcc01307df9f7aa646c1925dfbcbb2779192b1fd39771`, contains all19 cases.

Also independently verified 4ad8's `tests/native-access/account-continuation.test.ts` is byte-identical to accepted97571 (empty exact git diff). The external +39-line permissive200/unbound assertions must not be retained during integration; explicitly manifest the restored accepted file even if the author's local-base diff omits it. No frozen final acceptance or remote integration is issued here.

At20:36:02Z, expanded the same exact4ad8 suite for the analogous restart active-session lookup, also using `if(raw)`. **13PASS / 12FAIL, exit1** across25 tests: stored null/empty/0/false session values wrongly permit restart begin; object/array reject. The accepted corrupt-storage rule requires the same strict undefined-only absence check here; no new identity mechanism is needed. Sent finding to author and coordinator. Latest25-case reproducer SHA256 is `1f1a5fa1d0a1083a83a65937c3e070af3c7e0e1c27c5a8a5a414ed4189ee41d9` (the prior19-case hash above remains historical). Author working-tree corrections are not accepted without exact successor verification.
