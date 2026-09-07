# Otto — v1.5 final authorization boundary review

Verdict at observed 2026-09-07T18:24:10.925Z: **no blocking technical/source confidentiality or authorization-bypass defect demonstrated in exact df0636523ee90e94314e51ccb6930d7248ed70c5**. Recommend publication as disabled reviewed source after the narrow stale README status correction and new manifest verification. This is not full native, activation, deployment or release acceptance.

## Exact independent recovery

Clean isolated `/workspace/scratch/b1f4e4a310e1/otto-account-review` fetched local author commit df0636523ee90e94314e51ccb6930d7248ed70c5 and switched detached without modifying author files. Independently checked all22 file SHA256 values and exact changed paths versus65ed85420683bf8470677c83d87527f4d97e369f, excluding the self manifest. Manifest SHA256 `9a4a1e48b4e004c7b7910a48f0a51e785bf50a95914940f5048a4cf8a1fea010` matches. Source return SHA256 `2161ea3e572097d38e6800ae349b99bc9f37b5015342b7ada56aa35f3cbea49e`.

## Independently executed results

Normal direct-result local execution, default permissions, no escalation or altered credentials/network:

- `vitest run tests/native-access/account-final-authorization.test.ts`: **7 PASS**. Includes real production route, AccountGrantObject, maintained provider parsing/signing/encryption and a paused synthetic token exchange over in-memory DO storage: local signout wins, callback denies and original grant ciphertext/generation remain exactly unchanged.
- `vitest run tests/native-access/account-browser-session.test.ts -t 'native browser event gate'`: **1 PASS, four filtered SKIP**. Real local workerd AccountBrowserSessions object plus controlled internal CommitSink proves queued signout cannot interleave the held final commit; commit completes first, then signout invalidates the browser. This was author-UNRUN but is now independently observed on exact frozen source. It does not test a real grant DO commit, real provider, native timeout or restart.
- `npm run typecheck`: **PASS**.
- Nine-file affected battery (`account-ui`, `account-login`, `account-final-authorization`, `account-bootstrap`, `provider-native-flow`, `credential-leak`, `cross-account`, `consent-separation`, `worker-flow`): **51 PASS**. This includes the seven final-authorization tests above; do not add them twice.
- Reviewer worktree remained clean.

The original aaf4763 native-process polling result remains UNKNOWN. The whole-native and process-host routes that returned explicit tool errors were not rerun here. The permitted new focused native test's direct success is not a retroactive claim about those attempts or a blanket execution block.

## Security assessment

Public cookie-less connector POST and raw OAuth routes now deny signed assertion bypasses. Trusted browser wrapper constructs proof; external callers cannot select internal commit endpoints. Maintained connector renewal remains separate and is not silently tied to local browser logout.

Provider exchange occurs before final browser event locking and prepares one whole-candidate encrypted slot per subject. Candidate is unusable as a live grant; raw browser handle and provider credential are not plaintext in storage. Exact browser identity/generation/account epoch, original grant generation/status, random one-use ID and bounded expiry are bound. Stale IDs cannot delete a newer candidate. Candidate consumption and grant CAS share one grant-DO transaction. Existing-grant disconnect races deny stale candidates rather than compensate by deleting another grant.

Final browser authority holds `blockConcurrencyWhile` from active/fresh identity and epoch checks through the internal grant commit or maintained connector completion. Five-minute freshness applies at final commit. This is a defensible signout/commit ordering boundary, not a distributed rollback transaction: a commit that wins before subsequent local signout remains a grant, as specified. Caught errors avoid deliberately resetting the authority and the user-facing unknown-outcome wording does not falsely claim rollback.

Retired-handle signout route, matched-nonce state failure cleanup, failed activation proof cleanup and forward-only/malformed restored identity mappings are repaired and receive focused regression coverage. Identity remains exactly read:user, numeric and token-free; no email linking or managed runtime remains. Fixed provider endpoint, bounded transport, encryption/version constraints, anonymous public use and existing private custody remain.

## Required narrow documentation correction

`account/README.md` still contains a current-status paragraph saying this is a quiesced partial with still-open external consent bypass and grant-ordering findings. That statement conflicts with the successor's actual repaired code and nearby explanation. Correct or explicitly mark it historical, preserve current full-native/activation holds, and regenerate the manifest. A doc-only successor can inherit unchanged executable evidence after code hashes are compared; it must not inherit an inaccurate source SHA.

## Remaining gates, not new architecture questions

Full native/account-host battery, native signout-first with real persisted grant, real connector KV partial failure/timeout/restart, latest visual/target-client flows, actual GitHub shared-registration scope/S256/expiry/refresh behavior, runtime compatibility parity, approved two-principal fixtures and deployed cache isolation remain unverified. Configuration, resource/grant registration, key/backup/retention/incident ownership, current CI/Bugbot, governed release and learning remain separate gates. Committed activation is disabled.

No new human bind is required to publish reviewed disabled source or continue authorized repairs/tests. No live grants, resource creation, production configuration, deployment or release is authorized by this review. Coordinator owns Git integration and status supersession; this reviewer authored no product or GitHub writes.

## Exact doc-only successor disposition

**ACCEPT a006ecd3fda81b4f639ecf10fbfdd8fdffa0d7f8 for publication as disabled, partially validated source**, not whole B1 acceptance. Independently fetched into isolated reviewer checkout and compared against df063652: exactly `account/README.md`, source return and manifest changed; all runtime and test bytes are identical. All22 manifest entries independently match; new manifest SHA256 `e7110673a1213dd899e23ba5e535188618870780b896efd7eaf2b51051fcd308`. The stale current-status contradiction is corrected, previous UNKNOWN attempts retained, and native event-gate result attributed accurately to Otto. Executable evidence above transfers only by this demonstrated byte identity.

The successor also explicitly records a material remaining approved-contract gap: same-request interactive reauthorization continuation is absent; the current manual connector retry is not equivalent. A bounded opaque server-side continuation repair tied to original principal/resource intent and fresh journey review remains required. No caller-supplied next URL is authorized. This gap is not a new owner architecture decision and is not closed by source publication. Full native composition, real provider/client, operational, activation and release gates remain open unchanged.
