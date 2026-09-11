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
# V1.5 evidence amendment — actual upstream still UNRUN

Account-owned GitHub identity now replaces the stopped managed adapter in source. Identity requests and accepts exactly read:user and returns only verified numeric identity; token-free browser sessions have separate local revocation. Repository authorize requests repo offline_access, while exact returned repo scope and expiry/refresh metadata remain fail-closed requirements. The actual provider's returned opt-in semantics, shared-registration scope inheritance/isolation, S256 enforcement, expiry/rotation and prior-consent behavior are UNRUN. No synthetic result satisfies them; unexpected actual scope blocks activation and requires a reviewed amendment, not an automatic second registration.

Changed source tests exercise maintained protocol parsing, credential-sentinel absence, bounded redirects/response/timeouts, immutable identity, encrypted sessions and native-workerd races. Exact commands/counts and the interrupted test-run capability gap are in the source DEBRIEF supplied with this increment. Earlier evidence below retains its original scope, not v1.5 implementation proof. Production configuration/runtime parity, authorized live fixtures and target-client tests remain open.
