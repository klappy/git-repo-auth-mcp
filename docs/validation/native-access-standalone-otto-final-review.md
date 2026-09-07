# Otto — exact standalone recovery source review

**ACCEPT `253ef7d1b7862d3270829f25ff81449b2f9bf5b3` for the narrowly authorized non-conflicting source-review integration and ordinary CI.** Review completed against the isolated exact checkout at 2026-09-07T20:39:57Z. No remaining blocking defect demonstrated in this scoped repair. This is not acceptance of external fa709/9a15, original PR62 merge, live activation, deployment, real provider behavior or meal closure.

## Provenance and scope

Fetched the frozen commit from the sole author's local repository into `/tmp/otto-standalone-4ad8-review`, detached exact HEAD, preserving reviewer-only tests and dependency symlink. No product source was edited by Otto. Independently read the complete final source return and complete manifest; verified all24 file SHA256 values and complete changed-path coverage against manifest base65ed854 (25 paths including the manifest itself, zero uncovered paths).

- Manifest `docs/validation/native-access-v15-recovery-sha256.json`: `6dec0f138a90f83d580f51348389c50dd9e86d4a7c63888f57b650d36cc1518d`.
- Return `docs/validation/native-access-v15-source-return.md`: `15c065dff908435f76ce931fd03e62cb1bf41436fd5a33d10ea2a217da8127c1`.
- Browser authority: `4e221fd7f09698cece6ce06a3d1bfcf192e630f218156badd79e442ea551f84e`.
- Routes: `db63fa5416df3a934f05a812d933a6954065fe0015275348e9ca4f54a95705cd`.
- New standalone tests: `b1c9e0a790a66e7fc03764be1b2daf3cbcad30bea335d0c3d1f54fe86bf08b31`.

Inspected the runtime delta from stable partial4ad8 and the route/UI/design changes from accepted97571. The final8-path repair does not change provider, grants, dependencies, configuration or consumer source. Original continuation test is independently byte-identical to97571 (empty git diff), hash `64e55b9b730384c63d997f7b25bd06151a09cf0bdd038caff93a7c4498c24c40`, and is explicitly included in the whole manifest. Reconciliation must restore that file over the external +39 permissive happy-GET assertions; their presence in remote ancestry must not preserve their rejected current-tree behavior.

## Executed independent evidence

1. `npx vitest run tests/native-access/otto-missing-cookie-review.test.ts`: **25PASS, exit0**, repeated after the reviewer-only typing correction. The same negative cases previously demonstrated partial4ad8's malformed-slot/session failures. Final strict undefined-only checks now reject null, empty string, zero, false, object and array where applicable. Missing-cookie actual route preserves the live Pending; actual-store replacement and absent-slot ABA deny at start, consume and activation, preserving all state except permitted cleanup of the failed activation proof.
2. `npm run typecheck`: **EXIT0**. First attempt included a reviewer-only `Headers.getSetCookie` typing error; product was not changed. Replaced that reviewer assertion with standard `headers.get('Set-Cookie')` inspection, reran all25 tests and typecheck successfully. This harness correction does not hide a product failure.
3. `npx vitest run tests/native-access/account-standalone-recovery.test.ts tests/native-access/account-continuation.test.ts tests/native-access/account-final-authorization.test.ts`: **3 files / 26PASS, exit0**. Includes executed actual local SQLite/workerd rendered standalone journey, paused-provider Cancel/replacement, original connector state/S256 journey and final authorization regressions.

Reviewer25-case source: `/tmp/otto-standalone-4ad8-review/tests/native-access/otto-missing-cookie-review.test.ts`, SHA256 `039f36d814afa223d6d62339fa0d05a596821e844f044ee261617e78f542bee8`. Its storage/binding cases are synthetic, not native event scheduling. The separately executed author-native tests use actual local workerd/SQLite and synthetic exact provider responses, manual redirect assertions and tests-only corruption/expiry operations. Neither proves actual GitHub or actual client/browser scheduling. Author130PASS/2host-gatedSKIP, bundle382587 and diffcheck remain correctly attributed to the author's final run, not added to Otto's counts.

## Technical disposition

The explicit fixed restart route retains mandatory Cancel. Restart's captured mode/ref/browser/generation/revision is server-owned; POST markers cannot substitute for Pending proof. Cancel authenticates exact Pending or bounded retained association and clears the matching ledger nonce, invalidating consumed activation without removing session, grants or replacement intent. Callback routing uses consumed server association, not ambient continuation cookie. The recovery sends no shared continuation-cookie deletion.

Ordinary no-ref begin now atomically requires absence and captures a separate `Pending.unbound` revision/generation guard through start, consume and final activation. It does not silently become restart. Persistent revisions reject replacement and absent-slot ABA; slot removal retains the revision. Exact terminal expected identity/epoch remains binding after trusted-record validation even without a loadable active session; malformed binding, storage and invalid ledger generation deny. Final successor repairs both truthiness-to-absence findings, with dedicated regression evidence. Previously held4ad8 and external candidates remain held historically, not retroactively accepted.

## Integration authority and remaining gates

Independently read the full Git amendment in kitchen commit `c5ef414bbb3fa9a47ccae4e934415e4e5b39061f`, path `rail/2-cooking/2026-09-07-cartographer-native-access-b1/recovery/stale-cookie/local-repair/INTEGRATION-AMENDMENT.md`, blob `7270e1142fc5c7f03792fca2612cd1f77282f7e1`.

This acceptance supports only the same-dish new review ref `dish/2026-09-07-account-first-build-standalone-recovery`, after the other exact independent source acceptance. Coordinator must reread original remote head, preserve its ancestry and unrelated external CI/receipts, replace only the enumerated rejected same-path tree bytes, include exact receipts, and read back every published blob. New semantic changes require review. Original PR62 source is not to be overwritten; its eventual DO NOT MERGE/supersession notice does not claim the external worker stopped. No force update, close, merge or deployment follows from this review.

Integrated exact-head CI/Bugbot, final driver/visual review, actual supported-client correlation, real GitHub scope/S256/expiry/refresh behavior, compatibility/runtime parity, resource/logging/custody/retention controls, private-cache/public-performance validation, release and learning closure remain separate gates. The source remains disabled.
