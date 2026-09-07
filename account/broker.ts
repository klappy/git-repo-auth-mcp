import { createLocalJWKSet, importJWK, SignJWT, type JSONWebKeySet } from 'jose';
import { AccessDenied, bearer, verifyAccount, verifySession, type SessionContext, type SessionPolicy } from './session';
import { GitHubOAuth } from './oauth';
import { DurableGrantStore, GrantVault } from './grants';
import { GitHubReads, validateRead } from './upstream';

export type ReadAction = 'resolve_repository' | 'resolve_ref' | 'read_tree' | 'read_archive' | 'read_blob';
export interface BrokerReadRequest {
  requestId: string; resource: string; action: ReadAction;
  repository: { owner: string; name: string; id?: number }; ref?: string; sha?: string; path?: string;
}
export interface BrokerReadResponse {
  subject: string; githubId: number; service: string; resource: string; action: ReadAction;
  repository: { owner: string; name: string; id: number }; generation: number; decisionId: string;
  checkedAt: string; requestId: string; snapshotSha: string;
  intent: { ref?: string; sha?: string; path?: string }; data: unknown;
}
export interface BrokerFailure { error: 'access_denied' | 'unavailable' | 'invalid_request'; requestId: string; }
export class AccountBroker {
  constructor(private vault: GrantVault, private oauth: GitHubOAuth, private upstream: GitHubReads) {}
  async read(input: BrokerReadRequest, context: SessionContext): Promise<BrokerReadResponse> {
    validateRead(input);
    if (input.resource !== context.resource) throw new AccessDenied();
    const grant = await this.vault.credential(context.generation, context.githubId, this.oauth);
    // Rotation invalidates old assertions. The owned account must issue a current assertion before disclosure.
    if (grant.generation !== context.generation) throw new AccessDenied();
    await this.vault.current(grant.generation);
    const result = await this.upstream.read(input, grant.credential.accessToken);
    await this.vault.current(grant.generation); // Revocation while upstream is in flight denies the result.
    const serialized = JSON.stringify(result);
    const binary = result.data as { encoding?: string; content?: string; archive?: string };
    const decoded = binary?.encoding === 'base64' ? atob(binary.content ?? binary.archive ?? '') : '';
    if ([grant.credential.accessToken, grant.credential.refreshToken].some(token => serialized.includes(token) || decoded.includes(token))) throw new AccessDenied();
    return { subject: context.subject, githubId: context.githubId, service: context.service, resource: context.resource, action: input.action, repository: { ...input.repository, id: result.repositoryId }, generation: grant.generation, decisionId: crypto.randomUUID(), checkedAt: result.checkedAt, requestId: input.requestId, snapshotSha: result.snapshotSha, intent: { ref: input.ref, sha: input.sha, path: input.path }, data: result.data };
  }
}
export interface AccountEnv {
  PRIVATE_ACTIVATION: string; ACCOUNT_GRANTS: DurableObjectNamespace;
  ACCOUNT_ISSUER: string; SERVICE_ISSUER: string; BROKER_AUDIENCE: string; RESOURCE: string; SERVICE: string;
  ACCOUNT_JWKS: string; SERVICE_JWKS: string; VAULT_KEY_HEX: string;
  ACCOUNT_SIGNING_JWK: string; ACCOUNT_CONNECTOR_KV?: KVNamespace;
  GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string; GITHUB_CALLBACK: string;
}
function policy(env: AccountEnv): SessionPolicy {
  return { accountIssuer: env.ACCOUNT_ISSUER, serviceIssuer: env.SERVICE_ISSUER, audience: env.BROKER_AUDIENCE, resource: env.RESOURCE, service: env.SERVICE, accountKey: createLocalJWKSet(JSON.parse(env.ACCOUNT_JWKS) as JSONWebKeySet), serviceKey: createLocalJWKSet(JSON.parse(env.SERVICE_JWKS) as JSONWebKeySet) };
}
function errorResponse(error: unknown, requestId = crypto.randomUUID()): Response {
  // Never return provider errors, exception strings, owner names, paths, tokens or grant IDs.
  return Response.json({ error: error instanceof AccessDenied ? 'access_denied' : 'unavailable', requestId } satisfies BrokerFailure, { status: error instanceof AccessDenied ? 403 : 503, headers: { 'Cache-Control': 'no-store' } });
}
function accountBearer(request: Request) {
  if (request.headers.has('Authorization')) return bearer(request.headers.get('Authorization'));
  // Browser callback accepts ONLY an assertion minted by the configured account issuer.
  const cookie = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('__Host-account_assertion='));
  if (!cookie) throw new AccessDenied();
  return cookie.slice('__Host-account_assertion='.length);
}
async function contextFor(request: Request, env: AccountEnv) {
  const p = policy(env);
  return ['/read', '/session/renew'].includes(new URL(request.url).pathname)
    ? verifySession(bearer(request.headers.get('Authorization')), bearer(request.headers.get('X-Service-Authorization')), p)
    : verifyAccount(accountBearer(request), p);
}
/** Subject-sharded, separately bound durable custody. No legacy installation runtime imports. */
export class AccountGrantObject implements DurableObject {
  private vault?: GrantVault;
  constructor(private state: DurableObjectState, private env: AccountEnv) {}
  async fetch(request: Request): Promise<Response> {
    try {
      if (this.env.PRIVATE_ACTIVATION !== 'owner-verified') throw new AccessDenied();
      const context = await contextFor(request, this.env), url = new URL(request.url);
      await this.state.storage.transaction(async tx => {
        const subject = await tx.get<string>('subject');
        if (subject && subject !== context.subject) throw new AccessDenied();
        if (!subject) await tx.put('subject', context.subject);
      });
      const store = new DurableGrantStore(this.state.storage);
      if (!/^[0-9a-f]{64}$/.test(this.env.VAULT_KEY_HEX)) throw new AccessDenied();
      const key = Uint8Array.from(this.env.VAULT_KEY_HEX.match(/../g)!, s => parseInt(s, 16));
      this.vault ??= new GrantVault(store, key, context.subject);
      const oauth = new GitHubOAuth({ clientId: this.env.GITHUB_CLIENT_ID, clientSecret: this.env.GITHUB_CLIENT_SECRET, callback: this.env.GITHUB_CALLBACK, fetch });
      if (url.pathname === '/grant/status' && request.method === 'POST') {
        return Response.json({ generation: await this.vault.generation(context.githubId, context.generation) }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/session/renew' && request.method === 'POST') {
        const generation = await this.vault.generation(context.githubId, context.generation);
        const jwk = JSON.parse(this.env.ACCOUNT_SIGNING_JWK);
        if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) throw new AccessDenied();
        const key = await importJWK(jwk, 'ES256');
        const assertion = await new SignJWT({ github_id: context.githubId, service: context.service, resource: context.resource, grant_generation: generation }).setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setIssuer(this.env.ACCOUNT_ISSUER).setAudience(this.env.BROKER_AUDIENCE).setSubject(context.subject).setIssuedAt().setExpirationTime('5m').setJti(crypto.randomUUID()).sign(key);
        // Verify configured signing and verification ownership agree before returning an assertion.
        await verifyAccount(assertion, policy(this.env));
        await this.vault.current(generation);
        return Response.json({ assertion, generation, expiresIn: 300 }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/read' && request.method === 'POST') {
        if (Number(request.headers.get('content-length') ?? 0) > 8192) throw new AccessDenied();
        const body = await request.text(); if (body.length > 8192) throw new AccessDenied();
        return Response.json(await new AccountBroker(this.vault, oauth, new GitHubReads(fetch)).read(JSON.parse(body), context), { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/oauth/start' && request.method === 'POST') {
        // Explicit central-account action; no unauthenticated GET can trigger a repo grant.
        if (request.headers.get('Origin') !== new URL(this.env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const purpose = url.searchParams.get('purpose');
        if (purpose !== 'identity' && purpose !== 'repository') throw new AccessDenied();
        return Response.json({ authorizationUrl: await oauth.start(context, purpose, store) }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/oauth/callback' && request.method === 'GET') {
        const result = await oauth.callback(url, context, store);
        const generation = result.credential ? await this.vault.connect(result.credential, result.generation) : context.generation;
        return Response.json({ connected: Boolean(result.credential), generation }, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
      if (url.pathname === '/disconnect' && request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(this.env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        await this.vault.revoke(); return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      throw new AccessDenied();
    } catch (error) { return errorResponse(error); }
  }
}
export const accountWorker = {
  async fetch(request: Request, env: AccountEnv): Promise<Response> {
    // Health/docs remain callable during absent account configuration or provider outage.
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') return Response.json({ service: 'account-broker', privateEnabled: env.PRIVATE_ACTIVATION === 'owner-verified' });
    try {
      if (env.PRIVATE_ACTIVATION !== 'owner-verified') throw new AccessDenied();
      const context = await contextFor(request, env);
      return env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(context.subject)).fetch(request);
    } catch (error) { return errorResponse(error); }
  },
} satisfies ExportedHandler<AccountEnv>;

/** Maintained connector substrate. The owned account supplies real authorization UI + safe props.
 * No adapter or deployed login is invented here; assembly is a named activation obligation.
 */
export async function createConnectorProvider<Env>(options: {
  resource: string; issuer: string;
  apiHandler: NonNullable<import('@cloudflare/workers-oauth-provider').OAuthProviderOptions<Env>['apiHandler']>;
  authorizationHandler: import('@cloudflare/workers-oauth-provider').OAuthProviderOptions<Env>['defaultHandler'];
}) {
  const { OAuthProvider } = await import('@cloudflare/workers-oauth-provider');
  return new OAuthProvider<Env>({ apiRoute: new URL(options.resource).pathname, apiHandler: options.apiHandler, defaultHandler: options.authorizationHandler, authorizeEndpoint: `${options.issuer}/authorize`, tokenEndpoint: `${options.issuer}/token`, resourceMatchOriginOnly: false, resourceMetadata: { resource: options.resource, authorization_servers: [options.issuer] }, scopesSupported: ['repository:read'] });
}


/** Complete ONLY an explicit account-authenticated connector consent POST.
 * The account UI may call this JSON contract; no new UI or identity-linking authority is invented.
 */
export async function completeConnectorConsent(request: Request, env: AccountEnv, helpers: import('@cloudflare/workers-oauth-provider').OAuthHelpers): Promise<Response> {
  if (request.method !== 'POST' || request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
  const context = await verifyAccount(accountBearer(request), policy(env));
  const text = await request.text(); if (text.length > 8192) throw new AccessDenied();
  const body = JSON.parse(text) as { approved?: boolean; authorizationUrl?: string };
  if (body.approved !== true || typeof body.authorizationUrl !== 'string') throw new AccessDenied();
  const url = new URL(body.authorizationUrl);
  if (url.origin !== new URL(env.ACCOUNT_ISSUER).origin || url.pathname !== '/authorize') throw new AccessDenied();
  const auth = await helpers.parseAuthRequest(new Request(url));
  if (auth.resource !== env.RESOURCE || auth.scope.length !== 1 || auth.scope[0] !== 'repository:read' || !await helpers.lookupClient(auth.clientId)) throw new AccessDenied();
  const status = await accountWorker.fetch(new Request(new URL('/grant/status', request.url), { method: 'POST', headers: { Authorization: `Bearer ${accountBearer(request)}` } }), env);
  if (!status.ok) throw new AccessDenied();
  const { generation } = await status.json() as { generation: number };
  const { redirectTo } = await helpers.completeAuthorization({ request: auth, userId: encodeURIComponent(context.subject), metadata: { purpose: 'repository:read' }, scope: ['repository:read'], props: { subject: context.subject, githubId: context.githubId, generation, resource: context.resource, service: context.service } });
  return Response.json({ redirectTo }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function connectorSession(request: Request, env: AccountEnv, props: unknown): Promise<Response> {
  const c = props as SessionContext;
  if (!c || typeof c.subject !== 'string' || !c.subject || c.resource !== env.RESOURCE || c.service !== env.SERVICE || !Number.isSafeInteger(c.githubId) || c.githubId <= 0 || !Number.isSafeInteger(c.generation) || c.generation <= 0) throw new AccessDenied();
  // Props are supplied only by the maintained provider's verified protected handler, never request JSON.
  const jwk = JSON.parse(env.ACCOUNT_SIGNING_JWK);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) throw new AccessDenied();
  const assertion = await new SignJWT({ github_id: c.githubId, service: c.service, resource: c.resource, grant_generation: c.generation }).setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setIssuer(env.ACCOUNT_ISSUER).setAudience(env.BROKER_AUDIENCE).setSubject(c.subject).setIssuedAt().setExpirationTime('5m').sign(await importJWK(jwk, 'ES256'));
  return accountWorker.fetch(new Request(new URL('/session/renew', request.url), { method: 'POST', headers: { Authorization: `Bearer ${assertion}`, 'X-Service-Authorization': request.headers.get('X-Service-Authorization') ?? '' } }), env);
}
export default {
  async fetch(request: Request, env: AccountEnv, ctx: ExecutionContext): Promise<Response> {
    if (!['/authorize', '/token', '/connector/session', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource'].includes(new URL(request.url).pathname)) return accountWorker.fetch(request, env);
    try {
      if (env.PRIVATE_ACTIVATION !== 'owner-verified' || !env.ACCOUNT_CONNECTOR_KV) throw new AccessDenied();
      const { OAuthProvider } = await import('@cloudflare/workers-oauth-provider');
      type ConnectorEnv = AccountEnv & { OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers; OAUTH_KV: KVNamespace };
      const provider = new OAuthProvider<ConnectorEnv>({
        apiRoute: env.RESOURCE,
        apiHandler: { fetch: (r, e, c) => connectorSession(r, e, (c as ExecutionContext & { props: unknown }).props) },
        defaultHandler: { fetch: (r, e) => completeConnectorConsent(r, e, e.OAUTH_PROVIDER) },
        authorizeEndpoint: `${env.ACCOUNT_ISSUER}/authorize`, tokenEndpoint: `${env.ACCOUNT_ISSUER}/token`,
        resourceMatchOriginOnly: false, resourceMetadata: { resource: env.RESOURCE, authorization_servers: [env.ACCOUNT_ISSUER] }, scopesSupported: ['repository:read'],
      });
      // Library-required property is mapped ONLY to this new isolated namespace; never legacy runtime storage.
      // Trusted local adapter verifies the token against its exact intended resource, not this transport alias.
      const routed = new URL(request.url).pathname === '/connector/session' ? new Request(env.RESOURCE, request) : request;
      return await provider.fetch(routed, { ...env, OAUTH_KV: env.ACCOUNT_CONNECTOR_KV } as ConnectorEnv, ctx);
    } catch (error) { return errorResponse(error); }
  },
} satisfies ExportedHandler<AccountEnv>;
