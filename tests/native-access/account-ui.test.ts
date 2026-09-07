import { it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import worker from '../../account/broker';
import type { AccountEnv } from '../../account/broker';
import { accountPage } from '../../account/account-ui';
it('production account login stays unavailable; opaque/public pages and all errors bypass caches', async () => {
  const env = { ACCOUNT_ISSUER: 'https://account.example.test', PRIVATE_ACTIVATION: 'disabled' } as AccountEnv;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  for (const path of ['/account', '/account/signin', '/account/public']) {
    const response = await worker.fetch(new Request('https://account.example.test' + path), env, ctx);
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Set-Cookie')).toBeNull(); expect(await response.text()).not.toMatch(/access_token|refresh_token|localStorage|<script/);
  }
  for (const path of ['/account/signin', '/account/callback?code=INERT_CODE', '/account/disconnect']) {
    const response = await worker.fetch(new Request('https://account.example.test' + path, { method: path.includes('callback') ? 'GET' : 'POST', headers: { Origin: 'https://evil.invalid' }, ...(path.includes('callback') ? {} : { body: 'subject=forged&githubId=1001&csrf=forged' }) }), env, ctx);
    expect(response.status).toBe(503); expect(response.headers.get('Set-Cookie')).toBeNull(); expect(response.headers.get('Cache-Control')).toBe('private, no-store'); expect(await response.text()).not.toContain('INERT_');
  }
  const html = accountPage({ subject: '<script>unsafe</script>', csrf: '" autofocus', connected: false });
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('upstream writes');
  const denied = await worker.fetch(new Request('https://account.example.test/internal/bootstrap', { method: 'POST' }), env, ctx); expect(denied.status).toBe(403);
});

it('maintained registered-client browser consent accepts/cancels safely and rejects replay, wrong client/resource/redirect', async () => {
  const { harness } = await import('./worker-harness');
  const { createAccountConsent } = await import('../../account/account-routes');
  const { completeConnectorConsent, accountWorker } = await import('../../account/broker');
  const { OAuthProvider } = await import('@cloudflare/workers-oauth-provider');
  const { generateRandomCodeVerifier, calculatePKCECodeChallenge } = await import('oauth4webapi');
  const h = await harness(), kv = new Map<string, string>();
  h.env.ACCOUNT_CONNECTOR_KV = { async get(k: string, opts?: unknown) { const v = kv.get(k); return v === undefined ? null : opts === 'json' || (opts as { type?: string })?.type === 'json' ? JSON.parse(v) : v; }, async put(k: string, v: string) { kv.set(k, v); }, async delete(k: string) { kv.delete(k); }, async list() { return { keys: [], list_complete: true }; } } as unknown as KVNamespace;
  kv.set('client:browser-fixture', JSON.stringify({ clientId: 'browser-fixture', clientName: 'Fixture connector', redirectUris: ['https://client.example.test/callback'], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code'], responseTypes: ['code'] }));
  const identity = { subject: 'acct-A', githubId: 1001 }, managed = { access_token: 'INERT_MANAGED', refresh_token: 'INERT_REFRESH', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'acct-A' } };
  let csrf = 'nonce-one'; const handle = 'b'.repeat(64);
  const namespace = (fn: (value: Record<string, unknown>) => Response) => ({ idFromName: (s: string) => s, get: () => ({ fetch: async (_r: unknown, init?: RequestInit) => fn(JSON.parse(String(init?.body))) }) }) as unknown as DurableObjectNamespace;
  h.env.ACCOUNT_IDENTITY_REGISTRY = namespace(v => JSON.stringify(v.identity) === JSON.stringify(identity) ? Response.json(identity) : Response.json({}, { status: 403 }));
  const sessions = namespace(v => { if (v.handle !== handle || (v.operation === 'csrf' && v.nonce !== csrf)) return Response.json({}, { status: 403 }); if (v.operation === 'csrf') csrf = 'nonce-' + crypto.randomUUID(); return Response.json({ identity, managed, csrf }); });
  const env = { ...h.env, ACCOUNT_BROWSER_SESSIONS: sessions, OAUTH_KV: h.env.ACCOUNT_CONNECTOR_KV };
  let mismatchedIdentity = false;
  const consent = createAccountConsent({ async begin() { throw Error(); }, async complete() { throw Error(); }, async revalidate() { return { identity: mismatchedIdentity ? { ...identity, githubId: 1002 } : identity, managed }; }, async signout() {} });
  const provider = new OAuthProvider<typeof env & { OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers }>({ apiRoute: '/unused', apiHandler: { fetch: () => Response.json({}) }, defaultHandler: { fetch: async (r, e) => (await consent(r, e, e.OAUTH_PROVIDER, trusted => completeConnectorConsent(trusted, e, e.OAUTH_PROVIDER)))! }, authorizeEndpoint: h.env.ACCOUNT_ISSUER + '/authorize', tokenEndpoint: h.env.ACCOUNT_ISSUER + '/token', resourceMatchOriginOnly: false });
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  vi.stubGlobal('fetch', h.transport);
  try {
    const start = new URL((await (await accountWorker.fetch(h.request('/oauth/start?purpose=repository'), h.env)).json() as { authorizationUrl: string }).authorizationUrl);
    const cb = new URL(h.env.GITHUB_CALLBACK); cb.search = new URLSearchParams({ state: start.searchParams.get('state')!, code: 'synthetic' }).toString();
    expect((await accountWorker.fetch(new Request(cb, { headers: { Authorization: 'Bearer ' + h.user } }), h.env)).status).toBe(200);
    const auth = new URL(h.env.ACCOUNT_ISSUER + '/authorize'); auth.search = new URLSearchParams({ client_id: 'browser-fixture', redirect_uri: 'https://client.example.test/callback', response_type: 'code', scope: 'repository:read', resource: h.env.RESOURCE, state: 'client-state', code_challenge: await calculatePKCECodeChallenge(generateRandomCodeVerifier()), code_challenge_method: 'S256' }).toString();
    const send = (url: string, init: RequestInit = {}) => provider.fetch(new Request(url, { ...init, headers: { Cookie: '__Host-account_session=' + handle, Origin: h.env.ACCOUNT_ISSUER, ...init.headers } }), env as never, ctx);
    const page = await send(auth.toString()); expect(page.status).toBe(200); expect(await page.text()).toContain('Fixture connector');
    const post = (decision: string, nonce: string, url = auth.toString(), origin = h.env.ACCOUNT_ISSUER) => send(h.env.ACCOUNT_ISSUER + '/authorize', { method: 'POST', headers: { Origin: origin }, body: new URLSearchParams({ csrf: nonce, decision, authorizationUrl: url }).toString() });
    const first = csrf, denied = await post('deny', first); expect(denied.status).toBe(303); expect(new URL(denied.headers.get('Location')!).searchParams.get('error')).toBe('access_denied');
    expect((await post('approve', first)).status).toBe(403);
    const approved = await post('approve', csrf); expect(approved.status).toBe(303); expect(new URL(approved.headers.get('Location')!).searchParams.has('code')).toBe(true);
    expect((await post('approve', csrf, auth.toString(), 'https://evil.invalid')).status).toBe(403);
    for (const [key, value] of [['client_id', 'unknown'], ['resource', 'https://wrong.invalid'], ['redirect_uri', 'https://evil.invalid/callback']]) { const bad = new URL(auth); bad.searchParams.set(key, value); expect((await send(bad.toString())).status).toBe(403); }
    mismatchedIdentity = true; expect((await post('approve', csrf)).status).toBe(403); mismatchedIdentity = false;
    expect((await accountWorker.fetch(h.request('/disconnect'), h.env)).status).toBe(200);
    expect((await post('approve', csrf)).status).toBe(403); // Revoked after the consent page cannot grant access.
    env.ACCOUNT_GRANTS = { idFromName: () => 'absent', get: () => ({ fetch: async () => Response.json({ generation: 1, status: 'absent' }) }) } as unknown as DurableObjectNamespace;
    expect((await post('approve', csrf)).status).toBe(403); // Bootstrap absence is not repository authority.
    for (const r of [page, denied, approved]) expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  } finally { vi.unstubAllGlobals(); }
});
