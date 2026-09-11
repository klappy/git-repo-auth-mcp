# Native production rollout mechanism — source proposal

New dedicated target: native-account-broker-production-v1. This proposal does not repurpose the legacy git-repo-auth-mcp production trigger or invoke scripts/provision-service-key.mjs. Root has now created and verified only dedicated KV 2e6b07e0a24c44418565aab36255139f and metadata-only Worker 04f9fba63a4d498d91cbe1f72ce73b63. No executable, domain route, key, client, registration or deployment exists yet.

## Source integration

Publish scripts/deploy-native-production.mjs, tests/native-access/native-production-deployment.test.mjs and the reviewed account/wrangler.production.jsonc through a feature PR to main, then a reviewed main-to-production PR. Add package script deploy:native-production with value node scripts/deploy-native-production.mjs without changing existing scripts. The account config now contains actual dedicated KV ID 2e6b07e0a24c44418565aab36255139f; public client/key sentinels remain disabled. package.json adds deploy:native-production without changing existing scripts.

The guard accepts only production branch metadata, the dedicated connected Worker name, exact HEAD equal to NATIVE_PRODUCTION_REVIEWED_SHA and exact configuration bytes whose SHA256 equals NATIVE_PRODUCTION_CONFIG_SHA256. Both pins are supplied as literal reviewed values in the new trigger deployment command, not caller input. It verifies disabled private/registration/discovery defaults, explicit disabled observability/preview, exact production endpoints, dedicated non-staging KV and local three-class DO bindings/migrations. It invokes only the local installed Wrangler with the explicit native account config, autoconfiguration disabled and keep-vars. Unknown flags/arguments are refused.

The actual KV is now bound in source. A disabled bootstrap may keep public trust/client unbound once the KV is real; that is a health-only deployment, not a usable connection. Never promote unbound trust into activation. Final public trust material must be reviewed in the config and its hash recomputed; secrets never appear there.

## New connected-build trigger proposal

After root approval and native Worker creation, create a NEW trigger associated only with the native-account-broker-production-v1 Worker tag. Exact trigger settings:

- Repository: klappy/git-repo-auth-mcp; reuse the authorized repository connection, not another deployment target.
- branch_includes: [production]; branch_excludes: []; path_includes: [*]; path_excludes: []; root_directory: /; build_caching_enabled: false.
- build_command: npm ci && npm run typecheck && node --test tests/native-access/native-production-deployment.test.mjs
- deploy_command: NATIVE_PRODUCTION_REVIEWED_SHA=<actual reviewed production merge SHA> NATIVE_PRODUCTION_CONFIG_SHA256=<SHA256 of exact account/wrangler.production.jsonc bytes at that commit> node scripts/deploy-native-production.mjs

Angle-bracket fields are required runtime readbacks, not values to submit. Set both literal hex pins only after the production merge exists and independent checks accept that exact commit. Require WORKERS_CI_BRANCH=production and WRANGLER_CI_OVERRIDE_NAME=native-account-broker-production-v1 from the connected build environment; reject missing values. Read back the entire new trigger and all existing account triggers. Existing staging and legacy production trigger bodies must remain identical.

A subsequent production push cannot deploy through a stale pin. Root updates both pins only after exact new merge acceptance, then creates one build with branch=production and commit_hash equal to that accepted commit. New trigger creation must not launch an unpinned build; if the API has no paused creation, create with a deny-all deployment command first, read back, then set the reviewed pinned command and explicitly dispatch one build. The artifact pins actual source and config rather than assuming branch name proves review.

## Provisioning and deployment order

1. Root has applied the existing reversible infrastructure authority to allocate dedicated KV and create a metadata-only Worker. Preserve captured production/staging baselines; the native Worker has deployed_on null and no domain references.
2. Completed metadata preparation: native-account-connector-production-v1 KV 2e6b07e0a24c44418565aab36255139f; native-account-broker-production-v1 Worker ID 04f9fba63a4d498d91cbe1f72ce73b63, created at 12:05:27Z. No source upload or executable was used to bootstrap it. No legacy runtime/storage reuse.
3. The source now binds the actual KV. Independently review source and exact config diff. Local DO bindings create only the new Worker's AccountGrantObject, AccountBrowserSessions and AccountIdentityRegistry through the declared migrations.
4. Review and merge the source to production. Configure the new pinned trigger as above; deploy the disabled account. Read back complete bindings, deployment version, domain, observability and migrations; health must show privateEnabled false. No automatic provisioning is accepted.
5. Provision dedicated OAuth client and independent production account signing, service signing, browser and vault keys through secure custody. Account secrets: ACCOUNT_SIGNING_JWK, GITHUB_CLIENT_SECRET, VAULT_KEY_HEX, BROWSER_SESSION_KEY_HEX. Consumer secret: NATIVE_SERVICE_SIGNING_JWK. Do not create previous browser keys initially. Capture secret names only.
6. Bind public halves: account ACCOUNT_JWKS matches consumer NATIVE_ACCOUNT_JWKS; account SERVICE_JWKS matches consumer service signing key. Set dedicated GITHUB_CLIENT_ID and BROWSER_SESSION_KEY_ID. Exact callbacks are https://account.klappy.dev/account/callback and https://account.klappy.dev/oauth/callback, with wildcard disabled. Preserve all unrelated existing consumer bindings/resources. Public trust/config additions require a newly reviewed config and updated trigger hash; no staging keys.
7. Only after explicit activation review: enable account private mode and bounded production registration for the one approved host-client enrollment. Registration code source is PR79 merged1039c637 (parent reports accepted and required checks SUCCESS); confirm its actual merged ancestry before deployment. Independent production lifetime10 allowance remains an approval gate; never touch the staging ledger. Turn registration off after client readiness.
8. Validate guarded consent/return and live lifecycle/isolation gates, then apply reviewed consumer trust overlay with native mode disabled and logging/preview off. Capture all existing settings first. Only then flip consumer NATIVE_ACCESS_MODE for bounded approved fixtures and verify full binding parity. Production release remains separate from staging success.

Metadata-only bootstrap is complete. Root reports Workers API retained observability/logs/traces disabled, subdomain/previews false, logpush false and no tails. It ignored invocation_logs:false and returned invocation_logs:true beneath logs.enabled:false. Do not claim exact invocation flag parity yet; verify effective flags after the reviewed disabled build. Root is preparing a deployment-denied new trigger; it must stay denied until exact reviewed production commit/config pins replace that command.

## Rollback and containment

On a failed consumer proof, restore only NATIVE_ACCESS_MODE=disabled first, verifying full settings parity and the effective version. Then disable production registration and account private mode. Preserve durable state and allocated resources; never delete grants or reset the attempt ledger as rollback. Capture immutable versions before every settings change and restore only an independently accepted compatible version when needed. A rollback does not claim reversal of completed GitHub consent or already-issued grants.

Platform observability remains disabled for private processing. Legacy account production and existing Cartographer CORPORA, BENCH, D1, R2 and analytics bindings are preserved. Do not route native account traffic through the legacy Worker.

## Verification

node --test tests/native-access/native-production-deployment.test.mjs: 4 tests passed, covering valid disabled bootstrap and rejection of wrong/missing branch/Worker/pins, unbound or staging KV, cross-worker DO bindings, activation, logging/preview, callback drift and plain secret vars. This is local source validation; no real build/deployment claimed. Otto accepted the initial guard and four tests; rerun after actual-KV config update passed. Local installed Wrangler deploy --help explicitly lists --experimental-autoconfig as a boolean, confirming the selected false flag is supported.

