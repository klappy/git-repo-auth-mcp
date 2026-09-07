# Isolated account broker

This additive Worker is a generic central-account OAuth/read broker. It does not run the existing installation-token MCP service and imports nothing from `src/`. The existing service's no-provider-token-storage and no-content-proxy promises do not describe this separate Worker: this broker keeps encrypted per-person GitHub OAuth credentials server-side and performs constrained repository reads itself.

**Private activation is disabled.** The supplied Wrangler file has reserved synthetic URLs, no live client ID, signing key, vault key or connector namespace. No login, registration, grant, deployment or actual account linkage has been performed. A dry bundle is not a deployment.

## Runnable source

From the repository root:

```
npm ci --ignore-scripts
npm run typecheck
npm test
npx wrangler deploy --dry-run --config account/wrangler.jsonc
```

`tests/native-access/provider-native-flow.test.ts` runs the real pinned Workers OAuth provider, real OAuth4WebAPI code/refresh APIs and JOSE signing/encryption against synthetic keys, an in-memory KV/DO adapter and intercepted GitHub responses. Only the Cloudflare WorkerEntrypoint host class is mocked for the provider module. The separate Wrangler dry run checks bundling for the real host. Synthetic tests do not establish production KV consistency, provider permissions, expiring classic credentials or client interoperability.

## Central-account contract

The existing account owner supplies a verified account assertion or `__Host-account_assertion` secure HttpOnly SameSite=Lax cookie, signed ES256 by the configured account issuer. It must contain `sub`, numeric `github_id`, exact `service` and `resource`, positive `grant_generation`, single exact audience, and `iat`/`exp` no more than five minutes apart. Initial account generation is 1. Identity linking by email or mutable login is forbidden. This module does not invent the account's sign-in screen, existing identity binding or long-lived login session.

The account UI calls POST `/oauth/start?purpose=identity` or `purpose=repository`, with its exact Origin. The response contains the maintained-library GitHub authorization URL with one-use state and S256 PKCE. GET `/oauth/callback` verifies the same signed account, numeric GitHub identity, exact callback, actual scopes and required expiry/refresh metadata. Identity-only completion returns no repository credential; inherited `repo` scope is rejected. Repository completion returns only connection status and current generation. A single pending transaction per subject bounds retained state; expired state cannot be exchanged.

POST `/authorize` is the connector consent JSON contract: `{approved:true,authorizationUrl:"<original exact account /authorize URL>"}` with authenticated account and same Origin. It validates the registered client, exact resource and only `repository:read`, and requires a current repository grant before completing native authorization. The account UI consumes its returned `redirectTo`. No public UI or dynamic client-registration endpoint is enabled here. The maintained provider serves `/token` and OAuth metadata.

A consuming service sends the native opaque token plus its separate signed service assertion to POST `/connector/session`. The broker locally routes verification to the single configured resource URL; no network proxy or caller-selected URL is involved. This lets the provider enforce its real request-URL audience semantics without weakening exact-resource validation. Verified provider props contain safe identity/generation references only. The result is a five-minute account assertion, generation and expiry. The service then POSTs `/read` using that assertion and its own service assertion. `/session/renew` also supports already signed account assertions.

Refresh generations stay within an explicit consent epoch. Disconnect invalidates the epoch; an old connector token cannot renew after reconnect. Reconnect needs an independently authenticated account assertion at the current disconnected generation. The account owner maintains that state; an old native token cannot self-upgrade it.

## Activation inputs and custody

Otto/technical owner must configure and verify: account and service issuer/JWKS, exact audiences/resource/callback, account signing JWK, classic OAuth client, 32-byte vault key, independently scoped service identity, per-environment DO storage, and a new `ACCOUNT_CONNECTOR_KV`. The OAuth library requires an `OAUTH_KV` property internally; it is mapped only from this new isolated binding, never the existing application's namespace. No ARS service key or App private key is used. Each stateful environment requires its own project/namespaces; do not aim a preview at production state.

`PRIVATE_ACTIVATION=owner-verified` is an explicit deployment gate, not evidence that the named checks passed. The committed configuration remains disabled. Owner activation must verify actual scopes, credential expiry/rotation, account binding, namespace/key custody, retention/backups, client resource behavior and separately authorized fixtures. Missing or unsupported classic expiry/rotation fails closed. Source publication and deployment require their applicable review/release gates.

The API returns no provider credentials. It logs no request body or provider error. All account responses are no-store. Public `/health` remains independent of account configuration. Public repository navigation belongs to the consuming service and must remain independently anonymous; this broker never downgrades failed private requests to public caches.

## Local account host persistence test

Run `npm run test:account-host` from the repository root. CI invokes this named test separately from the fast unit battery. It starts the installed Wrangler/workerd on loopback with remote bindings disabled, temporary SQLite Durable Object persistence and temporary connector KV. The fixture imports the production `AccountGrantObject` and production account/connector handlers. It does not replace their grant store. Only the tests-only entrypoint seeds a synthetic registered client and intercepts provider fetches; unlisted provider destinations fail without a network fallback. No production entrypoint imports its control routes.

The fixture generates inert account/service signing and vault keys into a permission-restricted temporary configuration. It exercises real OAuth state/code handling and maintained connector consent, PKCE exchange and opaque-token verification with synthetic provider responses. It checks two owners, restart survival of grants and connector sessions, encrypted provider-token plaintext absence in persistence, six concurrent expired-grant reads producing one refresh, numeric identity rejection, disconnect/reconnect epochs and independent persistence directories with identical account subjects. It kills the actual process during refresh, verifies the uncertain state denies after restart, and recovers only through explicit disconnect and independently authenticated owner reconnect. Shutdown verifies process exit and rejects credential sentinels or generated private-key material in captured logs. The harness removes only its own temporary directories.

`ACCOUNT_HOST_RECEIPT_PATH=/tmp/account-host-receipts.jsonl npm run test:account-host` optionally appends sanitized process IDs, start/stop/kill outcomes and opaque directory fingerprints. Receipts contain no key, token, full storage dump or live provider data. Tests assert the claimed results before emitting the corresponding receipt.

**Proof limits:** the pinned installed workerd supports compatibility date `2026-06-16`; the isolated fixture explicitly uses that date. Production `account/wrangler.jsonc` remains disabled at `2026-09-07`. A first attempt with the production date was rejected by this local binary before test execution. These tests therefore establish actual local persistence/transaction behavior for the pinned test runtime, not production-date parity, Cloudflare failover, retention/backup correctness, live provider behavior or native client acceptance. Production compatibility and deployment validation remain separate gates. Local keys, fixture routes and namespaces must never be used for activation.
