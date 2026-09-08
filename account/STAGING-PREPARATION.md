# Disabled account staging preparation

Base: PR66 c70d0cb1374b8ceef28bfff5bc7989080d16f88f. The configuration-only partial below is historical; the final source includes the discovery amendment described below.

`wrangler.staging.jsonc` selects account/broker.ts and the approved isolated Worker name, origins and three SQLite classes. It disables private activation, workers.dev, preview URLs, routes and source observability. ACCOUNT_CONNECTOR_KV is declared without a made-up ID. Installed Wrangler 4.99.0 accepts a binding-only namespace for dry build. This is NOT deployment-ready: obtain the actual namespace named native-account-connector-staging-v15 and insert its verified ID before the connected Workers Builds deployment. Do not permit implicit namespace auto-provisioning or invoke the legacy root deploy script. No account ID is needed for the local bundle; the connected project must explicitly select the approved account.

No downstream callback, GitHub client ID, public/private signing material or browser/vault keys are fabricated. These are registration/activation inputs, not prerequisites for a disabled build. The original runtime denied discovery while disabled; the explicit discovery amendment below addresses that without activation. Source observability off does not prove platform/zone log exclusion; callback exposure still requires that readback.

## Initial configuration-only validation (historical partial)

- `wrangler deploy --config account/wrangler.staging.jsonc --dry-run --outdir /workspace/scratch/b1f4e4a310e1/account-staging-dry-bundle`: exit 0, 411.25 KiB / gzip 80.88 KiB; printed only the three intended DO bindings, ACCOUNT_CONNECTOR_KV, and eight nonsecret variables. Explicit dry-run exit, no deployment.
- `tsc --noEmit`: exit 0.
- Exact generated broker.js SHA256: a579f8bdb0ee4cf42822a2ae489e908cf5996e437a8575a6c96f9eea02a4c240.
- Configuration SHA256: 246094c3396ee3bedcbc3466bfb5d92727e72e36f8db30cb4869e68402cd4098.
- Installed dependencies reused from the existing account worktree via local symlink; do not publish node_modules or generated bundle. Dry bundle is local evidence, not proof of deployed runtime parity.

## Discovery amendment

Otto accepted the design before editing. STAGING_METADATA_DISCOVERY=enabled permits only exact GET requests to the account issuer's /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource while PRIVATE_ACTIVATION remains disabled. Query components, including bare ?, wrong origins and non-GET methods deny. Other account pages retain existing behavior; credential-bearing routes retain disabled behavior. No routes are exposed by the committed config.

The maintained provider serves metadata before environment/state access. Discovery uses config-only options and real AccountEnv, with denying fallback handlers and no invented KV binding/client callback. Responses are no-store. DCR/CIMD stay absent; no RFC9207 claim. Existing connector consent requires S256; all three provider constructions now explicitly use allowPlainPKCE:false to align advertised and enforced behavior.

Final author tests: 23 PASS across staging-discovery, provider-native-flow and account-ui. Typecheck is recorded in the author return. State/secret-read traps verify metadata needs no custody inputs. Negatives cover both metadata routes, wrong origin/method/query, disabled switch, encoded/suffixed/trailing paths and private routes. These are local tests, not actual host/provider or deployed runtime proof.

An intermediate amended Wrangler dry run printed 412.60 KiB/gzip81.06 and --dry-run: exiting now, generating bundle SHA2560d727e9397d162c4b48f293fa951e1b160194d2e69257faf7645609b55b5951f. The final process poll returned 'network approval was cancelled before a decision was returned'; final exit is UNKNOWN. No claim the user canceled it; no retry. This intermediate bundle predates the final stricter bare-query guard. Initial config-only dry-run exit0 remains historical evidence, not a final-source bundle claim.

## Maintained predefined-client seam

Installed @cloudflare/workers-oauth-provider 0.7.2 exports `getOAuthApi(options, env): OAuthHelpers`; `OAuthHelpers.createClient(clientInfo)` is the maintained registration operation. In dist/oauth-provider.js createClient generates a random client ID, defaults authentication to client_secret_basic, generates a secret for confidential clients, stores its hash under client:<id> in OAUTH_KV, and returns the one-time plaintext secret. Defaults include authorization_code and refresh_token. A caller must explicitly supply the verified host redirectUris and authentication method instead of relying on these defaults as evidence of host support. Broker maps OAUTH_KV only to ACCOUNT_CONNECTOR_KV; no legacy KV is suitable.

This seam can support a narrowly reviewed operator-only provisioning operation without public DCR/CIMD or changing request authentication. But it is not itself a protected transport. Calling it through a model-visible tool would expose the returned secret and is not authorized. No callable provisioning endpoint/helper is added here: the actual protected operator surface, operator authentication and human-only one-time delivery channel must be identified first. A generic secret-returning admin endpoint, fabricated callback or hand-written KV client record would not solve that boundary.

Before implementing that adapter, fix its exact trusted operator entry, one approved host client/callback/method, isolated namespace, one-time confidential output path, no-store/no-log behavior and ambiguous-create reconciliation. Review and test those properties before invocation. Never retry an uncertain create blindly, log the returned ClientInfo, or automatically delete the client/grants. Record only nonsecret client identity and disposition. This limitation does not block the disabled source/config build completed above.
