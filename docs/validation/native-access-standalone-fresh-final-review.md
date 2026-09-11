# Exact standalone recovery source review

Disposition: **ACCEPT for the bounded disabled-source repair**, not release or whole-journey acceptance.

Reviewed detached exact commit `253ef7d1b7862d3270829f25ff81449b2f9bf5b3`, tree `7d769ce0cb4c25a3a568113a9c2bf0d019f344aa`, at 2026-09-07 approximately 20:38–20:41 UTC. Accepted design `f37debefe667e0f87167253275624664a7074088a8aaf8521c1e85226d985ace`. Author's observed freeze is 20:38:13Z, before the 20:42:06.139Z fire cutoff; that freeze time is author evidence, not this reviewer's clock observation.

Read the complete source return and manifest. Independently verified all 24 SHA-256 entries and exact equality between the baseline changed-path set and those 24 paths plus the manifest itself. Eight changed paths versus accepted 97571; six successor paths versus reviewed partial 4ad8. No product edits were made in this review.

Manifest SHA-256: `6dec0f138a90f83d580f51348389c50dd9e86d4a7c63888f57b650d36cc1518d`.

Source-return SHA-256: `15c065dff908435f76ce931fd03e62cb1bf41436fd5a33d10ea2a217da8127c1`.

## Findings and repair disposition

The partial 4ad8 remains historically on HOLD; its 16 affected PASS and two reviewer PASS did not cover Otto's independently reproduced strict-absence defect. The successor now treats only undefined storage reads as absent in terminal-slot and explicit-restart session loading. Persisted null/empty/nonstring values deny. Terminal expected-identity falsy fields deny; stored malformed ledger/generation and malformed session timestamps deny. These checks occur before Pending mutation. The earlier reported blocker is resolved in this exact source, not retroactively erased.

Inspected explicit consumed-proof Cancel: exact captured mode/ref/nonce/browser/generation/revision is required, retained recognized-state proof remains bounded by expiry, and cancellation clears the matching ledger nonce so consumed activation fails its final check. Ordinary no-ref Pending carries a distinct absence/revision snapshot and does not acquire explicit-restart mode. Restart checks precede consume/activation; slot revision survives deletion and rejects replacement ABA. Trusted terminal identity/current epoch remains required without a loadable active session. No standalone response clears the shared continuation cookie; callback routing uses captured continuation purpose.

No remaining blocking defect found within this bounded delta. Otto owns the independent 25-case corruption matrix; this receipt does not claim its execution.

## Actual independent execution

Commands executed in `/workspace/scratch/b1f4e4a310e1/fresh-standalone-253ef7` with normally configured local dependencies, no network escalation:

- `./node_modules/.bin/vitest run tests/native-access/account-standalone-recovery.test.ts tests/native-access/account-continuation.test.ts tests/native-access/account-browser-session.test.ts tests/native-access/fresh-standalone-review-only.test.ts`: four files, **26 PASS**, 2.45 seconds. This comprises 24 candidate tests plus two separately added reviewer tests, not an author-suite total of 26.
- `./node_modules/.bin/tsc --noEmit`: exit 0, including the reviewer fixture.
- `git diff --check`: clean.
- Exact manifest validation via Node SHA-256 and `git diff --name-only` against manifest base: 24/24 hashes and 25/25 complete changed paths match.
- `git diff --exit-code 97571d3 HEAD -- tests/native-access/account-continuation.test.ts`: unchanged. SHA-256 remains `64e55b9b730384c63d997f7b25bd06151a09cf0bdd038caff93a7c4498c24c40`, excluding the rejected external additions.

Native tests exercise local workerd/SQLite and real rendered routes with bounded synthetic provider responses, manual redirects, consumed-provider-pause Cancel, replacement/ABA and malformed stored slot values. This is not actual GitHub or actual browser-client scheduling. The two reviewer-only cases use actual BrowserSessions methods with transactional in-memory storage: mixed-mode old callback cannot erase replacement restart Pending; post-consumption malformed revision denies Cancel/activation while retaining the corrupted ledger rather than resetting it. They are not native evidence.

Reviewer fixture: `/workspace/scratch/b1f4e4a310e1/fresh-standalone-253ef7/tests/native-access/fresh-standalone-review-only.test.ts`, SHA-256 `801b9dbb477a7ced0889b887ad4e6dda2d953ffb7f4df4b9ed132a9b56b9769b`. It is unchanged from the isolated partial reviewer fixture and excluded from the candidate manifest.

## Boundaries

The author reports a larger 130 PASS / 2 host-gated SKIP battery and bundle validation; those are attributed author results, not this review's executions. Historical failed, canceled or UNKNOWN tests remain unchanged. External fa709/9a15 and partial 4ad8 are not accepted by this successor receipt. Remote integration requires exact path reconciliation, CI/Bugbot and governed review. Consumer original-tool/request correlation, actual supported client/provider behavior, configured runtime parity, operations, activation and release gates remain open. No remote overwrite, merge, deployment, grant or resource action is authorized by this acceptance.
