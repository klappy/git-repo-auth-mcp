# Exact staging metadata/public exposure contract

Root authorized preparing the previously approved staging hostnames without enabling private access. Otto accepted the exact phase design before local edits. Both remote branches remain frozen; this is a local candidate for independent review and subsequent root integration. No hostname, deployment or platform setting was mutated by the author.

## Exact source changes

Account `account/wrangler.staging.jsonc` has exactly one route:

```json
{"pattern":"account-staging.klappy.dev","custom_domain":true,"zone_id":"d3fb39dede08497b44146266cc7c6d4e"}
```

Consumer `wrangler.staging.jsonc` has exactly one route:

```json
{"pattern":"cartographer-staging.klappy.dev","custom_domain":true,"zone_id":"d3fb39dede08497b44146266cc7c6d4e"}
```

Both keep workers.dev and previews disabled, source observability disabled and their allocated isolated KV IDs. Account PRIVATE_ACTIVATION remains disabled, STAGING_METADATA_DISCOVERY enabled. Consumer NATIVE_ACCESS_MODE remains disabled: anonymous public use only. No wildcard, production domain, credential, provider grant or client registration is added.

The consumer guard now enumerates two phases. An absent CARTOGRAPHER_STAGING_EXPOSURE accepts only routes[]. Exact value `public-only` accepts only the sole route above; every other value or mismatch fails. Set this nonsecret build variable only after the exact exposed configuration and effective logging are accepted. This is an explicit reviewed phase, not a guard bypass. Worker-name checks still apply. Both repositories use the new isolated exposure branch `dish/2026-09-07-native-staging-public`; consumer guard requires that exact branch. Account retains documented operational trigger checks and has no executable account guard. Existing remote branches remain frozen; root updates triggers only after exact review and publication of the new refs.

## Connected-build sequence

Root first reads back effective Worker logging/observability and applicable zone settings for the two staging hosts, verifying no sensitive callback/request capture. Source observability alone is insufficient. Keep source/config in Git; no dashboard-only route drift or CLI route override. After independent source review and root releases the frozen branches, integrate exact route/guard/test changes and record final commit heads.

Account command uses installed4.99.0 syntax: `npx --no-install wrangler deploy --config account/wrangler.staging.jsonc --experimental-autoconfig=false`. Consumer retains4.126.0 syntax: `node scripts/validate-staging-deployment.mjs && npx --no-install wrangler deploy --config wrangler.staging.jsonc --autoconfig=false`. This restates the corrected account flag, preserving the previous command failure as historical evidence.

After actual connected builds succeed, root reads back deployed version, exact custom domains, isolated storage, disabled private modes and effective logging. Then observe account metadata and consumer public health/docs only. Those observations do not prove GitHub OAuth, host token use, private isolation or release acceptance. Existing public latency HOLD and provider/client validation gates remain. A failed build/service authorization stops that affected action; no alternate credential or policy-read retry.

## Meaningful local verification

Both installed Wrangler JSON schemas were inspected:4.99.0 and4.126.0 each accept route objects with pattern, zone_id and custom_domain. Seven consumer configuration/guard tests pass. They cover exact public-only acceptance; absent-phase/exposed-config mismatch; public-only/unexposed mismatch; unknown phase; wildcard/production-domain/wrong-zone/custom_domain-false/duplicate routes; and private activation denial. Matching public-branch/public-only CLI invocation exits0. No network or secret reads occur in that validator. Separate dry-run commands validate actual version-specific flags and bundling, not live domain routing. Local receipt logs are account-staging-exposure-dry.log and consumer-staging-exposure-dry.log.

Root reports the prior isolated account build succeeded; that is coordinator evidence, not an author live-deployment observation. Parent-level effective logging must be off and read back before exposing either hostname. Consumer UI reset repair is reviewed separately and must be integrated atomically with this exposure candidate; no UI code was edited here.

## Required fixed-commit deployment preflight

Root observed an automatic push deploy an unreviewed commit. Both public staging triggers must therefore refuse every checkout except the exact independently reviewed40-character commit SHA, before invoking Wrangler. Earlier unqualified deployment command rows are superseded: each command below runs only after this fixed-commit preflight. Root writes the actual literal SHA into the control-plane command after publication; it is not a source environment variable, branch-tip lookup or a source file containing its own hash. No placeholder command may be activated.

Preflight command template (replace REVIEWED_40_HEX_COMMIT with the actual reviewed lowercase40-hex SHA before saving):

```sh
node -e 'const {execFileSync}=require("node:child_process"); const expected="REVIEWED_40_HEX_COMMIT"; if(!/^[a-f0-9]{40}$/.test(expected)||execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()!==expected) process.exit(1)'
```

Use `&&` to connect this preflight to the exact deployment command, so failure prevents Wrangler. Account then runs `npx --no-install wrangler deploy --config account/wrangler.staging.jsonc --experimental-autoconfig=false`. Consumer then runs `node scripts/validate-staging-deployment.mjs && npx --no-install wrangler deploy --config wrangler.staging.jsonc --autoconfig=false`; preserve its explicit public-only phase, allocated ID, Worker-name and branch checks. Each repository has its own fixed reviewed SHA. Root reads back the complete stored command and pinned SHA before triggering. Any newer automatic commit fails closed until independently reviewed and explicitly repinned. Otto accepted this requirement; no frozen config/test file changed in this documentation amendment.
