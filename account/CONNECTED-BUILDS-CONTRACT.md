# Account staging connected-build contract

## Main/staging and production topology

This section supersedes historical branch and command rows below after the separately reviewed control-plane migration. Feature PRs merge to `main`; staging deploys `npm run deploy:staging` to `native-account-broker-staging-v15` using `account/wrangler.staging.jsonc`. Promotion is a reviewed `main` to `production` PR. Production deploys `npm run deploy:production` to the existing legacy `git-repo-auth-mcp` with root `wrangler.jsonc`. No native production Worker/configuration is invented or enabled.

The executable guard requires exact `WORKERS_CI_BRANCH` and `WRANGLER_CI_OVERRIDE_NAME` metadata, target/config path, configured Worker and entrypoint. Missing, HEAD, feature, old dish or opposite-environment branch metadata fails closed. A detached build checkout is acceptable only when its trusted connected-build branch metadata is exact; Git checkout attachment is not an authorization substitute. Staging additionally validates its allocated KV, sole route, disabled preview/logging and disabled source private activation. The guard precedes Wrangler and every production helper. It does not replace the independent literal reviewed-SHA control-plane preflight below. Do not spoof build metadata to bypass a rejected local invocation.

Root must first preserve the current legacy production commit as `production`, record both active versions and full settings, and independently review the complete trigger update. Remove wildcard legacy preview exposure before publishing new review branches. Retarget legacy production exclusively to `production`, staging exclusively to `main`, preserving exact SHA pins and unrelated settings. Only after remote readback and acceptance may PR68 consolidate staging into main. No trigger, branch creation, merge, config/resource mutation or deployment is performed by this source proposal.

CI covers pushes and PRs to main and production, plus the temporary staging dish PR base during consolidation. It runs full unit tests, local host persistence, synthetic browser regression and the actual staging-config dry bundle. Legacy branch URL guessing and unrelated preview smoke are removed. The scheduled legacy live smoke explicitly checks out production. Neither synthetic CI nor a reachable URL proves the newly deployed revision: each deployment still requires version/source attribution, binding/configuration parity, effective logging checks and actual relevant host/provider acceptance. Native private-read, isolation, refresh and release gates remain separately required.

Rollback records must retain the exact previous staging/production versions, source commits, trigger commands/filters and effective settings. Root restores only the affected reviewed environment if acceptance fails; a Git revert is not by itself proof of live rollback. Source `PRIVATE_ACTIVATION=disabled` is preserved and may reset the live flag during deployment; any subsequent one-flag activation requires the existing independent review and full binding parity check. Production service-key provisioning is unchanged and is never executed by staging.

## Current exposure phase

The reviewed exposure candidate uses new isolated branch `dish/2026-09-07-native-staging-public` in both repositories. Original staging branches remain frozen; their settings below are historical disabled-build wiring. Root updates triggers only after exact new-ref review and integration. Account route is solely account-staging.klappy.dev in the approved zone, metadata enabled and PRIVATE_ACTIVATION disabled. Require effective parent logging off before exposure. Correct account deployment command is `npx --no-install wrangler deploy --config account/wrangler.staging.jsonc --experimental-autoconfig=false`; the earlier autoconfig flag below was an author verification error, corrected by the separate failure receipt. No account dependency upgrade or guard implementation is implied.

Build-token capability correction: the earlier operator-only prerequisite was an invented restriction and is withdrawn. Root may use existing opaque same-repository/account Build-token references for the independently approved exact new-staging build after its documented configuration and trigger checks. The service authorization response resolves capability; no new privilege or secret read is implied. Token-policy read returned9109 Unauthorized and remains STOPPED. A build denial stops the affected action, with no alternate credential or policy-read retry. Protected operator provisioning is an option for a concrete capability gap, not a prerequisite inferred from the failed policy read.

Otto accepted this contract-only design before authoring. Root owns live control-plane operations. No account dependency or helper is added. This document does not authorize activation or replace approved setup limits.

| Setting | Exact value |
|---|---|
| Repository | klappy/git-repo-auth-mcp |
| Repository ID / owner ID | 1264633180 / 118073 |
| Connected repository UUID | befc47d4-cd9d-4d02-b1ce-fcba3005aaf7 |
| Worker | native-account-broker-staging-v15 |
| Root-verified new empty Worker ID | 17c8ddfba28a48c5b0a0e140cc62c441 |
| Deployment branch | dish/2026-09-07-native-staging |
| Root directory | repository root `/` |
| Configuration | account/wrangler.staging.jsonc |
| Entrypoint | account/broker.ts; config-relative main broker.ts |
| Build command | `npm ci && npm run typecheck` |
| Deploy command | `npx --no-install wrangler deploy --config account/wrangler.staging.jsonc --autoconfig=false` |
| Nondeployment branches | disabled; preview deploy command `node -e "process.exit(1)"` |
| Watch paths | whole repository |
| ACCOUNT_CONNECTOR_KV | f1175de951844fbd80942d82c8416903, namespace native-account-connector-staging-v15 |

Readback PR67 head was203172f25230a1d3ff646dca93f99c4683c37595, config blob953aff43a7a228a09ff27cf4edad793a51fca94c. It already contains PRIVATE_ACTIVATION disabled, STAGING_METADATA_DISCOVERY enabled and routes empty. Root subsequently supplied the actual allocated namespace ID above; author inserted it without padding or alteration. It is32 lowercase hexadecimal characters. Root supplied project/repository identifiers are provenance from the coordinator, not a new independent author API observation.

Three existing SQLite classes remain confined to this new Worker: AccountGrantObject under account-v1; AccountBrowserSessions and AccountIdentityRegistry under account-browser-v1. Preserve2026-09-07 compatibility date and existing bindings. No legacy GitAuth state, production project, root npm run deploy, build-info/provision-service-key script or extra resource is part of this path. The root deploy script targets legacy GitAuth and must not be used.

Keep the connected trigger disabled until the exact reviewed ID-bearing config, final source head, project identity, commands, branch filters and staging logging have been read back. Missing or changed ID blocks deployment operationally; this account contract has no automatic guard and does not claim otherwise. No invented namespace or automatic provisioning is allowed. If a later edit removes the ID, stop the trigger rather than invoking Wrangler.

First deployment remains unexposed: workers.dev/previews false and routes empty. Read back deployed version, three class bindings, allocated KV and disabled private mode. Root then follows its separately reviewed staging-only hostname/logging sequence to expose read-only metadata. Metadata discovery is not GitHub sign-in, client registration, native grant or release acceptance. Actual provider/client custody setup remains separate. Do not add a route or private activation through a CLI override.

Installed Wrangler4.99.0 deploy help was executed locally and confirms config/autoconfig flags; no deployment command was executed. Cloudflare documents separate build/deploy commands and preview replacement in [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), and connected Worker-name matching in [Troubleshooting](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/). These are command contracts, not proof that the control plane has been configured. No API payload was invented or stopped schema route retried.

## Required fixed-commit deployment preflight

Root observed an automatic push deploy an unreviewed commit. Both public staging triggers must therefore refuse every checkout except the exact independently reviewed40-character commit SHA, before invoking Wrangler. Earlier unqualified deployment command rows are superseded: each command below runs only after this fixed-commit preflight. Root writes the actual literal SHA into the control-plane command after publication; it is not a source environment variable, branch-tip lookup or a source file containing its own hash. No placeholder command may be activated.

Preflight command template (replace REVIEWED_40_HEX_COMMIT with the actual reviewed lowercase40-hex SHA before saving):

```sh
node -e 'const {execFileSync}=require("node:child_process"); const expected="REVIEWED_40_HEX_COMMIT"; if(!/^[a-f0-9]{40}$/.test(expected)||execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()!==expected) process.exit(1)'
```

Use `&&` to connect this preflight to the exact deployment command, so failure prevents Wrangler. Account then runs `npx --no-install wrangler deploy --config account/wrangler.staging.jsonc --experimental-autoconfig=false`. Consumer then runs `node scripts/validate-staging-deployment.mjs && npx --no-install wrangler deploy --config wrangler.staging.jsonc --autoconfig=false`; preserve its explicit public-only phase, allocated ID, Worker-name and branch checks. Each repository has its own fixed reviewed SHA. Root reads back the complete stored command and pinned SHA before triggering. Any newer automatic commit fails closed until independently reviewed and explicitly repinned. Otto accepted this requirement; no frozen config/test file changed in this documentation amendment.
