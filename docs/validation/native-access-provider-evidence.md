# Native-access provider evidence

Coverage: synthetic source behavior, not a live GitHub or native-client acceptance claim. Baseline source: e3e22704e6aa9243690e4e0842637a265d089a39. Exact final candidate hashes and command output travel in the coordinator's review receipt; source publication/deployment is not implied.

Direct dependencies: oauth4webapi 3.8.8, jose 6.2.3, @cloudflare/workers-oauth-provider 0.7.2. Existing Vitest and TypeScript runners discover `account/**` and `tests/native-access/**`; no second framework.

| Surface | Executable evidence | Limit |
|---|---|---|
| GitHub code + PKCE + scopes/identity | oauth-callback, consent-separation, provider-contract tests | Intercepted HTTP; no live grant |
| Rotation and disconnect | refresh tests, consent-epoch regression | In-process fake atomic store; real DO adapter is source+bundle checked |
| Native OAuth connector | provider-native-flow | Real maintained provider consent/code/PKCE/token/protected-session, synthetic KV/client; WorkerEntrypoint host mocked |
| Signed broker flow | worker-flow, session | Real JOSE keys/signatures/JWE and production handlers, synthetic host storage and identities |
| Owner-qualified reads | cross-account, repository-scope | Synthetic 1001/1002 users and 2001/2002/2003 repos; no actual repository access asserted |
| Custody and no arbitrary proxy | credential-leak, broker-confused-deputy | Provider and service request ledger plus sentinels; no live write attempted |
| Deployment | isolated Wrangler dry bundle | No deployment, registration, namespace or cloud grant created |

Observed maintained-provider behavior: a wrong-resource code exchange returns `invalid_target` and consumes its authorization code; retry must obtain fresh consent/code. A valid opaque token is not a JWT and has its own token grammar. The provider checks the protected request URL against the token resource; the fixed internal resource rewrite is tested through the actual package, not a fabricated helper response.

UNRUN owner gates: real classic GitHub scope breadth/normalization and expiry/rotation, account issuer and numeric-ID linkage, actual client callback/PKCE behavior, native client interoperability, separate cloud namespaces and atomic persistence under host eviction, encryption-key custody/rotation/backup/retention, private cache/archive extraction/derived routes, release validation and independent review. Unsupported non-expiring or nonrotating classic tokens deny activation. No mock result resolves these gates.

Before live activation obtain safe owner receipts identifying issuer/JWKS owner, client-ID fingerprint and callback/resource, namespace/build identity and approved synthetic-to-real fixture mapping. Never put credentials or private content in this public evidence file. Re-run observed callback→native token→session→read→disconnect on the exact isolated build and approved users, including stale native token after reconnect and cross-user denial. Keep the production flag disabled until the broader validation gates are satisfied.
