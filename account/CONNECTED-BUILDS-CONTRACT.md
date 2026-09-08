# Account staging connected-build contract

Build-token capability disposition: root observed existing opaque product build tokens with owner_type=user. Its policy read returned9109 Unauthorized; that route is stopped, without retry or alternate credential. An authorized operator must verify the existing token's target authority through protected administration or provision a narrowly scoped token through protected entry. A new token is not required merely because its name differs. Never return token values to chat, source or model-visible tooling. Root retains all mutations; this document supplies no secret or invented token policy.

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
