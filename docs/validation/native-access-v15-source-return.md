# B1 v1.5 source return — first review candidate

## Recovery successor — disabled source, independent review required

Recovered clean aaf4763 under coordinator's renewed bounded fire: observed start2026-09-07T18:02:39Z, partial18:12:39Z, cutoff18:32:39Z. Original17:46:00.918Z cutoff remains expired, not reset. User approval remains valid. A tooling cancellation is not evidence the user withdrew authorization. No new production/config/grant/registration/deployment authority is inferred.

Closed the remaining static account findings in this successor: cookie-less public connector POST now denies; raw public broker OAuth start/callback deny and only the verified browser wrapper reaches them; matched nonce failure cleanup, orphan-forward restore protection and retired-CSRF signout route are covered by focused tests. Maintained-provider internal substrate fixtures were relabeled/adapted rather than weakening those new browser guards.

Repository provider exchange now stages a single encrypted candidate, never active grant authority. Candidate contains exact browser/identity/grant state binding, random one-use ID and five-minute post-preparation expiry. Whole-candidate JWE protects the raw browser handle as well as credential envelope. Final `commit-repository` in the real AccountBrowserSessions class holds blockConcurrencyWhile across fresh browser/epoch validation and binding-only grant commit; exact candidate consumption and existing grant CAS are atomic inside the grant DO. `commit-connector` holds that same gate through maintained getOAuthApi authorization persistence. Both require five-minute final freshness. Provider I/O occurs outside the browser gate. No compensating deletion of an old grant is used. Errors accurately leave uncertain commit outcomes unknown and direct checking account state.

Actual current recovery evidence:

-15 selected offline suites102PASS before the final route-race regression; the added seventh final-authorization test then PASS with its six existing peers. Final repeated battery receipt below supersedes these intermediates when present.
-Final repeated selected offline battery:15files103PASS, duration1.15seconds; typecheck EXIT0 and diff-check EXIT0; directly observed UTC2026-09-07T18:21:03Z. This does not include blocked Miniflare/native-host tests.
-Real browser route + real maintained provider exchange/signing/encryption code, with a paused synthetic provider and in-memory DO storage: signout wins during exchange; callback denies and old grant ciphertext/generation remain exactly unchanged. This is executable route coverage, not native event-gate evidence.
-Candidate secrecy/restart/one-use/replacement-ID/expiry/wrong-epoch/disconnect-CAS, final browser freshness, retired route CSRF, unknown nonce isolation/matched state burn, partial restore and public assertion bypass regressions PASS in selected offline tests.
-Typecheck EXIT0 and account esbuild bundle PASS351111bytes after source/route changes; git diff --check EXIT0. Bundle is not deployment.
-Native event-gate test added to account-browser-session.test.ts: actual local workerd authority with controlled internal CommitSink queues signout until commit completes, then proves session invalidation without undoing the committed grant. At author freeze this new test was UNRUN by the author; later independent execution is separately attributed below.

### Later independent evidence and doc-only supersession

At observed2026-09-07T18:28:41Z the coordinator authorized this doc-only correction; runtime/test source stays byte-identical to df0636523ee90e94314e51ccb6930d7248ed70c5. Otto reported an isolated exact-snapshot check of all22manifest entries, the final7authorization tests, the native queued-event-gate test1PASS, typecheck and nine affected suites51PASS. These are Otto's independent executions, not a rerun or result for the author's interrupted native sessions. The coordinator separately reported fresh-reviewer105PASS; that is a separate review result and is not added to the author103 count or treated as full native/host success. Final exact doc-successor review/disposition remains separately owned by reviewers.

The native queued-event-gate execution gap is discharged narrowly by Otto's reported1PASS. Native failed-commit/restart/timeout behavior, the full native/account-host battery and actual configured-runtime/provider/client acceptance remain open. Historical canceled test invocations remain UNKNOWN.

The approved DESIGN requires genuine interactive reauthorization to resume the same request through an opaque server-side continuation reference tied to the same principal/resource intent; caller-controlled next URLs are forbidden. The current first-setup sign-in link/manual return does not implement that continuation and is not a completed recovery journey. This is an existing approved contract gap, not a new architecture decision for the owner. A bounded continuation repair and fresh integration/journey review are still required before full acceptance.

Tool failure evidence: full native initial exec yielded session66090 normally, but its first read-only poll returned exact `network approval was cancelled before a decision was returned`; result UNKNOWN. Read-only ps showed no remaining Vitest/workerd process. Coordinator-authorized direct full-native exec with30000ms yield then failed in exec_command itself with the same exact cancellation (~7.7seconds). Distinct single-file Miniflare browser-session exec also failed with the same message (~7.7seconds). Those native routes were stopped without escalation, rehosting, credential changes, permission bypass or reasking the owner. Separate local offline suites and typecheck remained callable and were used for independent authorized work. Original session10755 remains UNKNOWN. Vitest prints a host-local11:xx time; authoritative UTC observations are recorded separately, not inferred from that display.

Remaining acceptance/release gates: final exact doc-successor fresh independent review and Otto disposition; native failed-commit/restart/timeout behavior; full native/account-host battery; approved original-request continuation repair and new visual rendering/target-client journey; actual provider scopes/S256/expiry/refresh and two-principal isolation; current runtime parity; existing CI/Bugbot and governed release. Initial unauthenticated authorize now offers a working sign-in path but explicitly requires returning to the connector to retry after repository connection. Automatic original-request resumption is not implemented or claimed. Final gate is not a distributed transaction: process loss during internal/KV commit can leave an uncertain outcome; production operational recovery/retention is still a gate. No deployment or meal closure claim.

The older checkpoint below is historical, not the status of this successor.

## Quiesced partial repair — NOT accepted, tests UNRUN

Coordinator requested safe-boundary checkpoint before permission return; author stopped source implementation. First candidate baee855676d6c356275018dc2edac5ae593111f1 remains preserved. This successor contains a bounded STATIC repair only: author/Otto orphaned-forward/malformed-reverse restore finding now denies via complete first-slice scan (10,001 scanned entries caps new identity creation); Otto callback failure finding now burns matched-nonce invalid state and discards activation proof after failure; fresh independent reviewer/Otto retired-handle route finding now dispatches signout to its own CSRF-authorized DO path before active-only load. Revoke-all still requires active authority inside the DO.

These repairs are NOT executable-validated. The test MemoryStorage fixture does not yet implement the new tx.list seam; fixture adaptation and new targeted regressions remain owed. No native test run, poll, proxy or CI was attempted after canceled session10755. Previous typecheckPASS belongs to baee855, not this successor.

Remaining STATIC BLOCKERS, not executed exploits:

- Otto: public broker defaultHandler falls back to completeConnectorConsent when accountConsent returns null for no-cookie POST; a valid broker assertion can bypass local browser/five-minute freshness for NEW connector consent. Must close external fallback while preserving trusted internal completion and existing connector renewal.
- Author: related public /oauth/start and bare /oauth/callback forwarding reaches accountWorker without browser wrapper/freshness; inspect and close external NEW repository consent paths while preserving internal browser calls and tests.
- Otto: repository callback exchanges and persists a grant before final browser epoch check; suppressing redirect after revocation is not rollback of that grant. Requires sound final sensitive-authorization linearization, not a claim response-denial alone resolves it.
- Initial configured /authorize journey without browser session still needs a reachable sign-in/recovery flow and target-host validation; no seamless onboarding claim.

No attempt was made to rush a broader broker/consent rewrite into the checkpoint. Implementation resumes only through coordinator direction after the required test permission decision. Source remains disabled; no deployment/live-ready or meal-complete claim.

Base: PR62 65ed85420683bf8470677c83d87527f4d97e369f. Approved decision: kitchen5b1869f4d5a91b94997a45d135f3a2a63e9d3c1b, ownerbindff752241474766d999daebe751ac3585a8bb535a. Actual amended fire39cb36837488464c23711c57b6d69162ff3e0899:17:16:00.918Z, partial17:26:00.918Z, maximum17:46:00.918Z. No prior cutoff reset.

## Actual work and evidence

Recovered exact clean source; npm ci --ignore-scripts succeeded. No AGENTS/CLAUDE shim exists at baseline; governing project governance README/SPEC/internal validation runbook and kitchen rules read. Initial read-only clone/source inspection preceded completed linecheck; ordering miss reported to coordinator and recorded here. No source edits preceded canonical amendment/fire.

Direct maintained identity bootstrap, token-free adapter, single-DO atomic numeric registry/browser-session authority, generation/epoch/nonce revocation, final async checks and purpose-separated/versioned keys replace managed runtime. Supabase dependency removed by package manifest edit and package-lock-only regeneration. Existing grant namespace/generation and private/public custody stay unchanged. UI and owning design/README change with behavior.

Before edits: typecheckPASS;5affected baseline suites19PASS. Intermediate changed native battery:16filesPASS/1host-gatedfileSKIP;101testsPASS/2explicitprocess-hosttestsSKIP. This intermediate run preceded final key/restore/native full-browser fixture and UI/config amendments and does NOT validate final source.

Latest full-native invocation started as exec_command npx vitest run tests/native-access, session10755. Polling already-started process via write_stdin failed: network approval was cancelled before a decision was returned. Outcome UNVERIFIED; that permission-blocked test route was stopped without bypass/retry. Later typecheck found3new fixturetypingerrors; request typing and bodystring corrections applied. Final npm run typecheck exited0 (session4201, observed17:32–17:33Z); git diff --check exited0. Exact snapshot still requires independent full test evidence.

Tests added/replaced cover identityexactscopes/numericID/state/callback/denial/redirect/timeout/size; real localDO mapping/session restart, parallelcallbackoneissuance, CSRF, same-ID recovery and different-ID denial, samebrowser/inflight/revoke-all races and unrelatedaccountnoninterference; deterministic idle/absolute/freshness, key overlap and partialmappingrestore; native browser signin/callback opaque-cookie/CSRF/replay flow. Existing repository/native-fetch/refresh/credential/cross-account suites remain intact except intended changed contract assertions. Fixture evidence is synthetic, not actual GitHub.

## Explicit open acceptance and release gates

No final full-native result after canceled approval. Fresh independent exactsnapshot review and Otto technical/security disposition pending. Final code must be tested, not accepted solely on intermediate101PASS. Nativehostprocess and visualrender receipts for new source pending. Actual production-date runtime, real GitHub S256/scope-isolation/offline_access returned semantics/expiry/rotation, real client/two-principal/three-owner fixtures and caches remain UNRUN. No remote Git/source merge, grant, resource, registration, configuration, DNS or deployment performed by author.

Operational code includes keypurpose separation, versioned bounded-overlap rotation, immutable mapping checks and per-browser/global login-start limits. Real retention/backup/edge abuse/alert/incident/key ownership must be bound before activation. Historic subject/grant inventory is mandatory; empty new namespace is not migration proof. Restore requires activationoff and oldbrowserkeyretirement because older complete snapshots can contain pre-revocation epochs.

## Learning

Account epoch and immutable ID mapping cannot be independently cached across two authorities and called atomic. Compose them in one transaction and test both callback-before-revoke and revoke-before-callback. Activity idle renewal must not refresh identity freshness. Local browser logout must never imply connector/grantrevocation. Preserve these obligations in owning design and regression tests; no learningclosure claim until governed review/merge.
