# Fresh independent account-authority v1.5 source review

Disposition: no new blocking static confidentiality or public-authorization bypass defect demonstrated in this bounded review. Suitable for governed source/PR review, NOT activation acceptance. Native execution by this reviewer is UNRUN; actual GitHub, operational custody, target-host, CI and release gates remain open.

## Exact custody

- Reviewed detached commit df0636523ee90e94314e51ccb6930d7248ed70c5, tree afc8b4dd937a5ec54a728cff837a2cb9cf0c693a, against 65ed85420683bf8470677c83d87527f4d97e369f.
- Isolated path: /workspace/scratch/b1f4e4a310e1/fresh-account-df063652. Author source was not modified. Existing node_modules was shared read-only for execution; no installation/network fetch performed.
- Independently verified all 22 manifest entries and exact changed-path coverage: 23 files including manifest itself. Manifest SHA256 9a4a1e48b4e004c7b7910a48f0a51e785bf50a95914940f5048a4cf8a1fea010. Source-return SHA256 2161ea3e572097d38e6800ae349b99bc9f37b5015342b7ada56aa35f3cbea49e.
- Read exact kitchen 5b1869f4d5a91b94997a45d135f3a2a63e9d3c1b decision/design/validation. Git blobs: DECISION df8bd380bcd70475068d33e7c3f9a25a69f999d2; DESIGN d3edd8c3aa9c474ac4f2ee0e0b2d46c942f03b58; VALIDATION 69ef559913ca682e10f4df4364830c4bedc55e3d. Existing ff752241 approval was not reopened.

## Independent execution

`npm run typecheck`: EXIT 0 on frozen source before reviewer fixture.

Explicit Vitest selection: account-final-authorization, account-login, provider-native-flow, credential-leak, refresh, consent-separation, oauth-callback, account-ui, cross-account, broker-confused-deputy, provider-contract, repository-scope, session, native-fetch-receiver, worker-flow (all tests/native-access/*.test.ts): 15 files, 105 tests PASS, duration 2.16 seconds. This is my execution, not the author's count. Node/provider integration uses fixtures and is not live GitHub/native-workerd evidence.

Distinct reviewer-only fixture `tests/native-access/fresh-review-only.test.ts`: 2 PASS. For both a different browser's account-wide local revocation and same-browser successful reauthentication/handle rotation, captured old proof is rejected by BOTH final repository and connector gates before grant dispatch. Real production BrowserSessions/AccountBrowserSessions methods, synthetic in-memory storage and event gate. Fixture SHA256 70df96654901c40ec2ee2342fde6192d546fc92841ab69507acd2b1e56c911ff. This additional fixture is not part of frozen source or manifest.

`git diff --check`: EXIT 0. No product changes, GitHub writes, grants, external configurations, deployment, credential extraction, new resources, subagents or blocked native operation performed.

## Source conclusions

Identity bootstrap remains a discriminated unauthenticated seam; maintained fixed-endpoint S256 exchange requires exact read:user in both token response and fresh /user scope evidence. Only numeric identity returns; access/refresh credentials remain request-local. Browser pending verifier and v2 session storage use authenticated encryption. Registry creation and session activation share transactional immutable fixed-issuer/numeric-ID mapping, browser generation and account epoch checks. Idle/absolute/fresh-consent times, predecessor-handle signout tombstones, wrong-state consumption and partial-restore denial are enforced in inspected source. Disposal is application-reference/storage/output disposal, not secure JavaScript memory zeroing.

Provider exchange stages encrypted unusable candidate without replacing current grant. Final browser proof/freshness checks precede binding-only candidate consume; candidate consume and grant expected-generation/status check share one transaction. Stale candidate IDs cannot erase their replacement; refresh/disconnect changes reject stale CAS. Public raw OAuth and cookie-less connector JSON consent deny. Connector session renewal remains governed by grant generation, not local browser epoch. Existing read path still checks grant generation before and after upstream reads.

The final event gate is not a distributed rollback guarantee. Commit-first followed by signout intentionally retains established grants; interrupted responses are accurately described as unknown outcomes. Candidate expiry prevents use but does not itself delete ciphertext; production cleanup/retention remains explicitly gated.

## Findings and required evidence

1. Native proof is incomplete, not a reproduced exploit. account-browser-session.test.ts:102 specifies commit-first queuing of signout around a synthetic CommitSink. The opposite required security ordering (real route pauses provider exchange, signout/revoke completes, release provider, assert rejection and unchanged actual grant) exists at account-final-authorization.test.ts:97 only with mocked storage/event gate. Before native acceptance, execute that ordering with the real browser/grant DO composition; include revoke-all and connector persistence, failed commit/restart and timeout/unknown-outcome behavior. Do not relabel the mocked route test or internal host-fixture bypass as native browser proof.
2. Low-severity documentation drift: account/README.md:80 still calls the source a quiesced partial with open consent/freshness bypasses and old grant-persistence ordering. Current source-return labels those repaired. Amend this stale current-status paragraph through normal author ownership; retain the no-activation warning and historical receipts.
3. Live release gates remain binding: exact GitHub scope isolation for fresh/previous broad consent, S256, actual offline_access/expiry/refresh behavior, accepted issuer/callback/resource and key namespaces, inventory/migration/restore/retention, runtime compatibility, actual supported-host/two-principal/cross-owner/custody journeys, CI/Bugbot and governed release. No synthetic test closes these.

At review end Otto separately reported executing one native event-gate test successfully. That is attributed third-party evidence, not my native execution, and does not expand the test's synthetic-sink/commit-first scope.

## Exact doc-only successor disposition

Independently compared a006ecd3fda81b4f639ecf10fbfdd8fdffa0d7f8 (tree ec07c96dda1493408c7b648b1f75526b598c4125) against df0636523ee90e94314e51ccb6930d7248ed70c5. Exactly three paths changed: account/README.md, docs/validation/native-access-v15-source-return.md, and docs/validation/native-access-v15-recovery-sha256.json. All runtime and test bytes are unchanged. Independently read the complete documentation diff and verified all 22 successor manifest entries against exact Git objects. Successor manifest SHA256 e7110673a1213dd899e23ba5e535188618870780b896efd7eaf2b51051fcd308; source-return SHA256 3aeb27fcec67fe32856c370f9362ceceb2e79b54b1839670f610ea01b0b2f6dd.

The stale README finding is resolved. Later native event-gate evidence is correctly attributed to Otto and does not overwrite historical UNKNOWN runs or become my execution. My 105-test result stays distinct from author counts. Existing source conclusions and offline test applicability carry forward because runtime/tests are byte-identical; no additional execution is claimed.

Disposition for a006ecd3: ready for governed disabled-source publication/review, not full security journey or release acceptance. Preserve native signout-first/real-grant composition, failed-commit/restart/timeout, full native/account-host, provider/runtime, visual/supported-client, operational custody, CI/Bugbot and release gates. Approved same-principal/resource opaque continuation and original-request resumption remain an unimplemented existing contract: manual return/retry is not a substitute and requires bounded repair plus independent integration/journey review.

Reproducible reviewer-only fixture remains at /workspace/scratch/b1f4e4a310e1/fresh-account-df063652/tests/native-access/fresh-review-only.test.ts, SHA256 70df96654901c40ec2ee2342fde6192d546fc92841ab69507acd2b1e56c911ff. Preserve as separately labeled review evidence, not as a claim that it belongs to the frozen author suite.

## Test-only native redirect successor: independent review and execution

Separate bounded review started at observed UTC 2026-09-07T18:41:15Z under explicit coordinator authorization to inspect and run the corrected focused native case. Frozen successor 9ef3545f4fd0c8d4e5551c4e71e8840ebf5c8149, tree ed691340f825398c6815e06311ad47dfc79bc22e, was reviewed in detached /workspace/scratch/b1f4e4a310e1/fresh-account-9ef3545.

Exact diff against a006ecd3 changes only tests/native-access/account-browser-session.test.ts, source-return and manifest. Production runtime is unchanged. Independently verified all 22 manifest hashes. Manifest SHA256 78be1e819b8197ffbdbd7a266ef2322edac209ad61f1210412bb3e462fad8600; affected test SHA256 5fb0827e62a29f61ab5f31c689b46779e5d95f103ec3bca7cec49364a1543001; source-return SHA256 760d418d5f25035528d80450f734ce1f7155cc5cb93f5756db659f141c577e8d.

No assertion weakening: both raw redirect expectations remain 303; exact opaque Secure/HttpOnly/SameSite/Path cookie assertion, no credential/verifier response sentinels, replay denial and exact two provider-call sequence remain. Manual redirect handling explicitly prevents the test client following the inspected authorization/callback redirects. Added zero-provider-calls-before-authorize-redirect assertion is stronger. Synthetic worker egress now permits only exact POST GitHub token and GET GitHub /user routes and throws on every other destination/method. This does not change product OAuth or network policy. Installed Miniflare source inspection independently confirms its redirect dispatcher sends requests outside the initial runtime origin to its global dispatcher; this is not evidence of which page produced the historical CI 200 response.

Independent ordinary local command: `./node_modules/.bin/vitest run tests/native-access/account-browser-session.test.ts -t 'actual native browser sign-in/callback consumes state and emits only opaque Secure cookies'` returned EXIT 0, 1 PASS / 4 name-filtered SKIP, duration 939ms. The selected case ran actual local workerd and synthetic provider egress with explicit manual redirect handling. `npm run typecheck` and `git diff --check` both returned EXIT 0. No permission escalation, canceled batch rerun, external provider journey or grant/resource change occurred.

Disposition: accept this exact test-only correction for governed disabled-source publication and CI. It repairs redirect observation and narrows fixture egress without masking product behavior. Historical canceled invocations remain UNKNOWN; the exact CI 200 body/destination remains unobserved. The one corrected native sign-in test is now independently PASS but does not establish full native/account-host, event-race/timeout/restart, continuation, target-client, real GitHub/provider, operational or release acceptance. All previously retained gates remain.
