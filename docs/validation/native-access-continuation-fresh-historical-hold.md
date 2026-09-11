# Fresh independent frozen browser-continuation source review

CURRENT DISPOSITION: HOLD. The earlier acceptance below is superseded by the reproduced reauthentication-cancel defect in the final delta section. Earlier passing execution receipts remain historical facts, not complete cancellation coverage.

Review started observed UTC 2026-09-07T19:20:45Z. Exact candidate 696d55714fe1b3287d7e08465cbf481226900582, tree c6be1e761ab3e11ceae2bad092ff08f22d835865, detached in /workspace/scratch/b1f4e4a310e1/fresh-account-696d557. Author product files were not edited. Accepted browser-only design is 8049d863ed8f1d232a6ab881eb809c31cf54a927e2302cde505bc28bef223ecc; all seven Otto intermediate observations were read and independently reconciled below.

## Disposition

Accept this exact browser-only continuation source for governed disabled-source publication/review and successor CI. No remaining blocking security/source defect demonstrated in this bounded independent review. This is not activation, actual supported-client or full same-tool/snapshot continuation acceptance. No owner architecture question is reopened.

## Exact scope and hashes

Eight paths differ from reviewed 9ef3545: account/README.md, account/account-routes.ts, account/account-ui.ts, account/browser-session.ts, docs/design/native-access-identity.md, docs/validation/native-access-v15-recovery-sha256.json, docs/validation/native-access-v15-source-return.md, tests/native-access/account-continuation.test.ts. No package, broker runtime, credential vault, namespace, configuration or consumer changes.

Independently verified all 23 whole-candidate manifest entries. Manifest SHA256 92aa00b5e95b342646098c8b0a7433660c2d87e4bf1aa3ff46a5936dc9f73d7d; source-return SHA256 17c32793eb770810e8073d39a51a9a5645fe9970e8016b5fea7de0ef1f311ff1; continuation-test SHA256 f34cb22857773f3062d5822b0a8306e2b6fa7028c6faba93e16702a43ef8d4f6. Exact baseline-to-candidate changed-path coverage checked separately, including manifest itself. Unrelated author's learning draft remains excluded.

## Independent execution, not author counts

Command: `./node_modules/.bin/vitest run tests/native-access/account-continuation.test.ts tests/native-access/account-browser-session.test.ts tests/native-access/account-ui.test.ts tests/native-access/account-final-authorization.test.ts`.

Result: 4 files, 22 tests PASS, duration 1.88 seconds. This includes actual local SQLite/workerd browser continuation, native first setup through maintained provider code exchange, stale same-principal reauth, paused identity/repository replacement, durable spend/fault/runtime restart, existing local browser lifecycle and final authorization negatives. These use synthetic provider egress; they are not actual GitHub or target-host observations.

`npm run typecheck`: EXIT 0 on frozen source before adding reviewer fixture. `git diff --check`: EXIT 0.

Two distinct reviewer-only tests PASS (325ms): (1) a previously identity-bound flow whose local session has expired rejects newly verified different numeric identity, retires the exact continuation, and refuses even the original identity reusing the now-terminal reference; (2) oversized Unicode replacement preserves previous intent, and a saturated global admission counter rejects another browser before any new ledger/slot mutation, preserving current continuation. Real BrowserSessions methods with synthetic transactional storage; not native serialization proof.

Reviewer fixture is separate from candidate source/author counts: /workspace/scratch/b1f4e4a310e1/fresh-account-696d557/tests/native-access/fresh-continuation-review-only.test.ts, SHA256 37b5de24b6251c766fe8b1804f5cbb473308c722b8aaf058c991073abc22c0ae. No full-suite result is inferred from this 22+2 execution.

## Security and intermediate-finding reconciliation

1. **Replaced callbacks:** bounded hashes of provider state, initiating nonce and continuation distinguish recognized old callback from current pending flow before deletion. Unknown wrong-state/current-nonce failure still burns that current flow. Exact-ref checks persist at activation and final repository commit. Native tests pause both provider exchanges, replace slot, and verify old callback cannot bind/commit replacement. State-binding capacity denies rather than evicts live entries.
2. **Cancellation:** identity/repository pages expose exact-ref cancellation with CSRF; connector denial retires its exact reference. Old form/cookie mismatch denies before deleting newer slot. Pending activation or prepared repository completion subsequently cannot authorize from a removed continuation. Existing local signout remains distinct from grant disconnect.
3. **Terminal UX:** invalid/expired/spent/replaced continuation goes to explicit restart-from-connector guidance, not the unusable same-signin cycle. Unknown completion is not represented as rollback. Fixed public explorer destination is literal and caller next parameters do not control it; no live availability claim follows.
4. **Bounds:** intent maximum 7KiB and whole creation record maximum 8KiB use UTF-8 bytes. Field allowlist, code response type, exact S256 shape and read scope are validated. Public authorization parameters reject duplicates and unknown fields; resumed form cannot mix stored reference and replacement authorization URL.
5. **Admission:** per-browser/global creation counters precede new ledger/slot writes in the same transaction. Reviewer negative confirms global exhaustion leaves no new allocation. Expiry is authorization denial, not automatic ciphertext cleanup; production retention remains named debt.
6. **Identity mismatch:** reauth derives expected identity/epoch from a validated trusted record, never decoded expired credentials. Activation mismatch deletes only captured matching ref after failed transaction, not a replacement. Expired-session wrong-identity behavior was independently exercised. Rotation preserves captured intent/deadline and updates generation atomically.
7. **Native evidence honesty:** actual native first setup/token/S256 and replacement cases now execute. Durable-spend test calls production spend, injects a 503 before downstream completion, disposes/restarts the whole local runtime and proves session persistence plus same-ref denial. It is correctly labeled an injected pre-completion fault and native restart, not SIGKILL, timeout recovery or atomic cross-DO/provider-KV rollback.

Final resumed connector completion checks current browser proof/freshness and exact continuation inside the existing event gate, spends/removes intent transactionally before reconstruction and maintained completion, and never unspends/replays authorization code redirects. Stage changes are not repository authority; actual verified broker grant remains required. Raw public privileged routes, cookie-less consent denial and credential-custody boundaries are unchanged. Session/account epoch versus grant generation separation survives.

## Limits and retained gates

Source/browser slice acceptance does not close the consumer's original tool, canonical arguments, selected snapshot and correlation recovery requirement. Actual maintained-client retry/correlation, full ordinary/host/CI/Bugbot successor, final visual journey, native timeout/real process interruption and partial KV failure semantics, actual GitHub scopes/S256/expiry/rotation, production-date parity, operational key/restore/retention/incident ownership and release/learning acceptance remain open. Historical canceled executions remain UNKNOWN, not recovered by this successful different run.

No product edits, dependency changes, external Git writes, grants/resources, actual provider call, permission escalation or deployment performed. Reviewer-only fixture and this receipt are local evidence artifacts for coordinator preservation.

## HOLD delta — stale-session reauthentication Cancel (2026-09-07, after initial review)

Otto reported a blocking uncovered branch after the initial passing matrix. I read his exact reviewer-only fixture and independently reproduced it on frozen 696d557 with a deterministic +300001ms clock: local session remains valid but no longer satisfies new-consent freshness; continuation is principal-bound, and reauth begin renders a newly generated Pending nonce. `cancelContinuation(browser, ref, pending.nonce, active.handle)` rejects `access_denied` instead of canceling.

Cause: account/signin renders `loginCsrf=pending.nonce`, and its Cancel form uses that nonce. The cancel route detects the still-valid active session and passes activeHandle. account/browser-session.ts cancelContinuation chooses the active branch solely from activeHandle and requires `session.csrf`, a different nonce. The user's legitimate reauth cancellation therefore fails, leaves the flow live and violates the accepted explicit-cancellation contract. This is a concrete recovery/control defect; no credential disclosure is claimed.

Independent command: `./node_modules/.bin/vitest run tests/native-access/fresh-continuation-review-only.test.ts -t 'stale-but-valid'`: EXIT 1, 1 FAIL / 2 name-filtered SKIP, 347ms. Failure is `promise rejected Error: access_denied instead of resolving`, production account/browser-session.ts:76. This new regression was appended after the two previous tests passed; those passes are preserved and are not claimed to cover this branch.

The reviewer fixture now has three tests; its updated SHA256 is f2a5c6055b4a243066d83bcde35ee1cc3c1e0bc71dd0f595f2d79c1c6bb2a031. The earlier two-test hash identifies the preceding evidence version, not current file bytes.

Withdraw my blanket browser-source acceptance for 696d557 pending a separately frozen authorized repair and retest. Any fix must explicitly authenticate cancellation against the captured pending lease/ref/browser/generation or the valid session CSRF, without accepting an arbitrary nonce or letting a stale tab cancel a replacement. Require actual rendered reauth form → cancel route regression, both nonce modes, wrong nonce and replaced-ref negatives. Do not broaden cookie/ref authority merely to pass this test.

Original source cutoff has passed; this review neither resets it nor authorizes product edits. Await coordinator disposition on any in-window successor. Consumer/client/provider/operational/release gates remain open.
