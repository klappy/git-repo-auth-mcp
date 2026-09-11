# Fresh independent cancellation recovery review

FINAL DISPOSITION: accept exact new-fire successor 97571d367bc5b8ac5abdf1f04dcaccbaba28c906 for governed disabled-source publication/CI. The cancellation blocker is resolved on that successor, not retrospectively on held 696d557 or the inadmissible late d145 return. See final exact-snapshot section below.

New recovery authorization: kitchen 17c13afad38dd265b06f408e87aa9565efd46e67, rail/2-cooking/2026-09-07-cartographer-native-access-b1/recovery/cancel-repair/FIRE.md, blob 536fdf26ae2e0b2eb89f21fa67d066e2051aa1c7. Window 19:27:51.829Z–19:42:51.829Z; independent review started observed 2026-09-07T19:28:39Z. This is new authorized validation, not a reset or retroactive acceptance of the prior source cutoff.

Input d145b5d5d38bedb0107f78029e439c4df6daea03 is preserved late source. Its earlier false timing receipt is not accepted. I inspected the narrow proof delta in an isolated detached worktree /workspace/scratch/b1f4e4a310e1/fresh-account-d145b5d. Final corrected receipt/manifest successor is still required before final source disposition.

## Narrow proof inspection

Cancellation now allows either same-browser valid session CSRF or a separately authenticated pending proof. Pending proof requires nonempty nonce matching current ledger.pendingNonce AND either the exact unexpired Pending lease/ref/generation, or the exact nonce/ref association retained at provider start with unexpired deadline. The continuation itself must first satisfy exact ref/browser/current ledger generation, absolute expiry and account identity/epoch checks. Cookie presence or a caller-selected mode does not suffice. Active-session branch additionally requires that valid session belong to the same browser; it rotates session CSRF without revoking the session/grant. Deletion stays restricted to the already validated exact continuation and associated pending record.

The retained state binding permits legitimate cancellation after pending state has been consumed into an in-flight provider activation proof. It does not authorize an old nonce after a new pending lease replaces it, an expired binding, or an old reference against a replacement slot. No new blocking proof defect found in this exact narrow delta.

## Actual independent execution during the new window

1. Copied the unchanged three-test reviewer fixture from the held 696d557 review into the isolated corrected-runtime worktree. All 3 PASS (382ms), including the exact deterministic stale-but-valid session reauth Cancel regression that previously FAILed with access_denied. The original FAIL and earlier actual passes remain preserved in the prior receipt.
2. Added independent rendered-route and negative coverage; 8 reviewer-only tests PASS (565ms):
   - Actual production account/signin rendering while session is stale for consent but still valid; extract the Cancel form's exact Pending nonce/ref and submit to real account/continuation/cancel route with the existing session/browser/continuation cookies. Observe 303 to fixed public route, original session identity still valid, continuation retired and no grant broker call.
   - Consume pending after provider start; valid retained capture can cancel and prevents later activation.
   - Expired retained capture (controlled stored deadline) and superseded current pending nonce deny without changing state.
   - Old reference and old captured nonce cannot erase replacement. Existing session-CSRF and anonymous Pending-lease cancellation still work.
   - Prior global admission, oversized replacement and expired-session wrong-identity tests remain passing.
3. `./node_modules/.bin/vitest run tests/native-access/account-continuation.test.ts tests/native-access/account-browser-session.test.ts tests/native-access/account-ui.test.ts tests/native-access/account-final-authorization.test.ts`: 4 files, 23 tests PASS, 2.13 seconds, on exact d145 runtime/tests under this new authorization.
4. `npm run typecheck`: EXIT 0. `git diff --check`: EXIT 0.

Reviewer-only fixture: /workspace/scratch/b1f4e4a310e1/fresh-account-d145b5d/tests/native-access/fresh-continuation-review-only.test.ts, SHA256 c02735c323a2a7420848dcf0729e868d96095fba75c3cf12c289f512443c458c. This is separate reproducible review evidence, not part of author frozen suite or count. Rendered-route reviewer test uses real production routing/authority methods with synthetic in-memory storage; native runtime proof is supplied separately by the affected source tests, never inferred from the reviewer mock.

## Current limits

No product edits, dependency changes, network escalation, actual GitHub provider activity, external Git writes, grants/resources or deployment. Historical canceled executions remain UNKNOWN. Underlying 696d557 cancellation HOLD is not silently removed from its receipt; a final successor disposition must name the exact corrected candidate and evidence. Browser-only recovery still does not establish consumer tool/snapshot/correlation, actual supported-client/provider, production parity, operational custody or release acceptance.

## Final exact successor verification and disposition

Independently inspected frozen 97571d367bc5b8ac5abdf1f04dcaccbaba28c906, tree eecec08e3a3c3110bcb2cf03625e9411a6d158d0, in detached /workspace/scratch/b1f4e4a310e1/fresh-account-97571d3. Exactly three paths changed from d145: continuation test, source-return and manifest. All runtime bytes are identical to the narrow proof delta validated above. The receipt explicitly corrects the false pre-cutoff statement, records the actual 19:23:53Z late freeze, and separates fresh recovery validation from old 119/9-test results. No retroactive deadline or late-evidence acceptance inferred.

All 23 manifest entries independently verified, with complete coverage of 24 changed baseline paths including the manifest. Manifest SHA256 d521ebeda69b2d12e0f9b9d5d6f46874d5f78f8ab672425e80c3eed25a012e95; source-return SHA256 6e84e7baba97ca066fc3e0d0f37346a1c264134c5868be56a9609d8285348725; exact continuation test SHA256 64e55b9b730384c63d997f7b25bd06151a09cf0bdd038caff93a7c4498c24c40.

Independently reran the same four affected source suites on the final successor: **4 files / 24 tests PASS**, duration 2.00 seconds. Typecheck and diff-check EXIT 0. New native test now submits actual rendered stale-session Cancel through production route, both before provider start and during a paused consumed provider exchange; wrong nonce/ref/browser deny first, successful cancellation preserves existing session and repository grant, canceled callback denies. New source expiry/replacement test leaves replacement intact and permits legitimate session-CSRF cancellation. This supplements—not replaces—the separate eight reviewer tests described above.

No remaining blocking defect demonstrated in the bounded cancellation repair. Exact successor may proceed to governed disabled source publication and required integrated CI/Bugbot. This resolves the specific stale-session cancellation HOLD only for the new successor; preserve 696d's failed evidence and d145's late provenance. Actual client/provider, consumer tool/snapshot correlation, runtime parity, operational custody, full host and release/learning gates are unchanged. No whole-meal halt or release-ready claim follows this narrow disposition.
