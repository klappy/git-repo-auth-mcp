# Production registration source debrief

Baseline: klappy/git-repo-auth-mcp commit 7f83339599c682efb678c0258aee49308ba5083e.

## Problem and result

The existing registration handler accepts only the staging issuer/resource. Production configuration alone cannot enroll a ChatGPT connector. This change adds a separately enabled, fixed production target using the existing bounded registration implementation.

Production selection requires PRODUCTION_CLIENT_REGISTRATION=enabled, ACCOUNT_ISSUER=https://account.klappy.dev and RESOURCE=https://cartographer.klappy.dev/mcp. Provider endpoints come from that fixed target. The Durable Object verifies its own identity against production-client-registration-v1 before any ledger access. No request can choose its target, object name or quota.

The production ledger retains the same immutable lifetime allowance of 10 admitted attempts and durable admission/write-started/written sequence. Failure after admission does not refund an attempt. Staging retains its original object identity and existing ledger; it is never reset or replenished. Production activation and its allowance still require the separate reviewed operational decision. No deployment configuration is enabled by this source change.

## Exact publication delta

1. account/staging-registration.ts — add fixed production target, optional production flag, shared target selection; route registration and provider endpoints through the selected target.
2. account/browser-session.ts — use the selected target for the existing Durable Object self-identity guard.
3. account/broker.ts — add only PRODUCTION_CLIENT_REGISTRATION?: string to AccountEnv.
4. tests/native-access/account-production-registration-unit.test.ts — production variant of the existing bounded metadata, quota, failed-write and corrupt-ledger tests.
5. tests/native-access/account-production-registration-target.test.ts — reject cross-environment tuples/origins and staging object identity for production operations.
6. docs/validation/production-registration-DEBRIEF.md — this record.

Integration warning: the account/broker.ts delta is one optional environment field. Apply that line-level change to the integration head and preserve the concurrent renewal implementation. Do not replace the integration broker file with the isolated baseline file. No other files from the local scaffolding tree belong to this publication.

## Validation

- npm run typecheck — passed.
- npx vitest run tests/native-access/account-production-registration-target.test.ts tests/native-access/account-production-registration-unit.test.ts tests/native-access/account-staging-registration-unit.test.ts tests/native-access/account-staging-registration.test.ts — 4 files, 25 tests passed.
- Otto independently reviewed the source and reran the same 25 tests: accepted, 25 passed (reported to the cook in-session).

The unchanged strict ChatGPT redirect allowlist, bounded metadata parser, supported OAuth methods/grants, no-store responses and no-reset ledger are reused. Other hosts are outside this change.

## Operational limits

Source-only work. No GitHub OAuth client, Cloudflare resource, secret, grant, registration attempt, configuration flag or deployment was created or changed. Production configuration and enrollment rollout remain separate reviewable work. Feature publication must wait for root confirmation that review/2026-09-11-production-registration is excluded from the wildcard build trigger. Merge and deployment checks are not claimed here.

