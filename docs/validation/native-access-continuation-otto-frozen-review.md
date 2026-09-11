# Otto — frozen account browser continuation review

**Latest disposition: ACCEPT exact successor `97571d367bc5b8ac5abdf1f04dcaccbaba28c906` for disabled scoped source integration and ordinary CI.** See the final section for new-fire independent evidence. Historical696d HOLD and late d145 overrun below remain preserved; this is not live-client, provider, whole-request recovery or release acceptance.

## Exact candidate and disposition

Candidate `696d55714fe1b3287d7e08465cbf481226900582`, frozen by author at 2026-09-07 19:19:00Z. **HOLD complete browser-continuation acceptance: independently reproduced reauthentication Cancel defect.** This is a narrowly scoped functional/approved-contract defect, not demonstrated credential disclosure or authorization bypass. Do not represent the candidate as fully accepted browser continuation.

Review cloned the exact local commit into the existing isolated `otto-account-review`, preserving unrelated author work. Verified all23 manifest entries and manifest SHA256 `92aa00b5e95b342646098c8b0a7433660c2d87e4bf1aa3ff46a5936dc9f73d7d`. Eight changed tracked paths against previously reviewed9ef3545: three account runtime paths, one new test, two owning docs and two evidence files. No provider/configuration/dependency or consumer source change in this candidate.

## Independent executions

- `npx vitest run tests/native-access/account-continuation.test.ts tests/native-access/account-final-authorization.test.ts tests/native-access/account-login.test.ts`: **3files41PASS**, exit0.
- `npm run typecheck`: **PASS**, exit0.
- `git diff --check`: PASS.
- Reviewer-only `tests/native-access/otto-reauth-cancel-review.test.ts`: **1FAIL**, precisely at `cancelContinuation` active-session CSRF comparison. This file is in the isolated review checkout only, not authored product cargo.

The reviewer's first minimal-storage harness omitted object/multiple-key put and failed identity fixture setup. Correcting that harness reached the actual cancellation branch; only the second failure is the reproduced product defect. Neither failure is a network/permission cancellation. No live provider, credential, registration or deployment was attempted.

## Reproduced cancellation defect

`GET /account/signin` renders a reauthentication page with `loginCsrf = pending.nonce`, including its Cancel form. The browser may still have a valid session that is stale for the five-minute consent requirement. POST `/account/continuation/cancel` detects that valid active session and passes activeHandle. `cancelContinuation` then requires **session.csrf**, not the pending nonce actually rendered. Cancellation fails with access_denied and leaves the continuation active. Anonymous cancellation tests pass and do not cover this branch.

The independent regression establishes a valid session, creates its bound continuation, starts reauthentication and submits the exact rendered Pending nonce with that session handle. Expected cancellation is rejected. The defect applies before the session is idle-expired, including the ordinary stale-freshness reauth journey.

Minimal repair: validate the exact captured pending ref/nonce/browser/generation/expiry transaction as a cancellation authority, or the correct active-session CSRF, rather than selecting solely by session-cookie presence. Never trust a caller-selected cancellation mode or only ledger nonce without its pending reference binding. Add a same-session reauthentication Cancel regression and retain wrong/stale cancel replacement-preservation tests. Source window ended19:23:20Z; any repair not completed under the existing window requires the coordinator's bounded continuation authority, not an implicit extension by this reviewer.

## Intermediate findings reconciliation

The frozen candidate addresses the earlier callback recognition, UTF-8 size bound, preallocation rate gate, terminal guidance and identity-mismatch exact-reference retirement observations. Cancellation now exists at early stages but has the remaining branch defect above. Recognized old callback comparison uses hash(received state), matched nonce/ref hashes and rejection before Pending deletion. Unknown wrong-state/current-nonce behavior remains separate. Identity mismatch cleanup checks the exact captured reference before removal, preserving replacements.

Whole record creation is UTF-8 bounded to8KiB with7KiB intent reserve; allocation admission precedes new ledger creation. Actual expiry/retention cleanup remains an explicitly documented operations gate rather than a claim that expired ciphertext disappears. Principal-bound expired-session recovery uses trusted encrypted continuation plus ledger/current epoch; continuation does not mint authority. Final resumed connector path loads and spends the exact ready ref inside the existing browser gate before maintained completion, leaving spent intent unavailable after uncertain completion.

The independently executed new suite includes native first setup, controlled same-principal stale-session reauthentication and both provider-pause replacement orderings. Its persistence test executes the actual spendContinuation method through a test-only native route, returns an injected503 before any maintained completion, disposes/restarts the runtime with durable storage and verifies spent denial. That proves durable spend persistence across an orderly runtime restart; it is **not SIGKILL, production commit-connector fault composition, or a distributed provider-KV failure proof**. Keep those distinctions in evidence.

No additional blocking confidentiality/bypass defect was demonstrated in the bounded source inspection. Correct the narrow Cancel branch, return a frozen successor and rerun this exact independent regression before source acceptance. Actual client registration/linking, consumer tool/snapshot recovery, provider behavior, production operations and release remain separate open gates regardless of this local repair.

## New bounded repair validation — 2026-09-07 19:28Z

Independently read new kitchen FIRE at `17c13afad38dd265b06f408e87aa9565efd46e67`, blob `536fdf26ae2e0b2eb89f21fa67d066e2051aa1c7`. This authorizes distinct recovery19:27:51.829Z–19:42:51.829Z; it does not retroactively authorize the late d145 candidate. The original696d HOLD and late33-second overrun remain preserved.

Fetched repaired runtime `d145b5d5d38bedb0107f78029e439c4df6daea03` into the isolated reviewer checkout, preserving the exact reviewer-only regression. Independently reran that unchanged formerly failing test plus continuation/final-authorization/login: **4files43PASS**, exit0. These are newly executed results under the new fire, not late tests relabeled in-window.

The six-line cancellation delta validates exact Pending nonce/reference/generation/deadline or a retained captured-state nonce/reference/deadline binding, additionally matching the current ledger pending nonce. Existing continuation validation supplies browser/current generation/epoch checks. An active same-browser session may accept that proof or its own CSRF; mere cookie presence no longer selects the wrong proof. Cancellation still removes only the exact continuation and its matching Pending, not identity or repository grants. No new defect demonstrated in this bounded runtime diff.

Final acceptance still awaits corrected frozen receipt/manifest and the required rendered reauthentication form/route, captured-binding and negative tests. The old false pre-cutoff receipt is not accepted by this intermediate validation.

## Final exact successor acceptance — 2026-09-07 19:33:30Z

**ACCEPT `97571d367bc5b8ac5abdf1f04dcaccbaba28c906`**, author-frozen19:32:29Z under new FIRE17c13afa. The original cancellation defect is repaired and independently verified. This permits scoped disabled source integration and exact-head ordinary CI, not activation or release.

Verified the exact successor changes only the continuation test, source-return receipt and manifest relative to d145; runtime bytes are identical to the independently reviewed/retested repair. Reverified all23 manifest entries:

- manifest SHA256 `d521ebeda69b2d12e0f9b9d5d6f46874d5f78f8ab672425e80c3eed25a012e95`;
- corrected source return `6e84e7baba97ca066fc3e0d0f37346a1c264134c5868be56a9609d8285348725`;
- continuation test `64e55b9b730384c63d997f7b25bd06151a09cf0bdd038caff93a7c4498c24c40`;
- browser-session runtime `6a00500d7c5adb5b27e2f4bf236c7ee5871a8dedcc0a69688b24beaad2684f76`.

The corrected receipt explicitly states the late19:23:53 freeze, false earlier pre-cutoff wording, original696d HOLD, archived late bytes and separately authorized new-fire evidence. This review does not backdate d145 or reuse late tests as new executions.

On the **exact97571d successor**, independently ran continuation/final-authorization/login plus the reviewer-only cancellation file: **4files45PASS**, exit0; separately ran **typecheckPASS**, exit0. These counts include two reviewer-only tests: the original696d failure now passes unchanged, and a distinct captured-start test consumes Pending, proves wrong nonce/browser/ref cannot mutate the surviving flow, then cancels via the correct retained proof and confirms later activation denies. The latter uses actual BrowserSessions with synthetic storage; it is not mislabeled native evidence.

The expanded author test, included in this independent run, exercises actual rendered stale-session reauth form values and real account Cancel routing in local workerd: before provider start and during the paused identity exchange after Pending consumption. Both succeed while keeping the original browser session and repository connection. Wrong nonce/ref/browser deny first; the flow remains cancelable. Additional expired/superseded proof and valid-session-CSRF tests pass. No new proof selector trusts caller mode or merely chooses by cookie presence.

The previous native spend persistence versus actual production fault-composition distinctions remain unchanged. All earlier source/external-client/provider/consumer/operations gates continue to apply. No further blocking technical/security defect was demonstrated in this scoped repair and frozen return. Coordinator must preserve external remote changes, add separate fresh review, and run the exact integrated-head CI/Bugbot before treating the delivery stage as validated.
