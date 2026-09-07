import { importJWK, SignJWT } from 'jose';
import type { AccountEnv } from './broker';
import { AccessDenied } from './session';
import { productionLogin, type LoginAdapter } from './login';
import type { IdentityTransaction } from './oauth';
import { opaque, type BrowserSession } from './browser-session';
import { accountPage, browserHeaders } from './account-ui';
export interface AccountBrowserEnv extends AccountEnv { ACCOUNT_BROWSER_SESSIONS?: DurableObjectNamespace; ACCOUNT_IDENTITY_REGISTRY?: DurableObjectNamespace; ACCOUNT_LOGIN_CALLBACK?: string; }
const cookie = (request: Request, name: string) => request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? '';
const setCookie = (name: string, value: string, age = 1800) => `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}`;
function response(body: string, status = 200, extra: Record<string, string> = {}) { return new Response(body, { status, headers: { ...browserHeaders(), 'Content-Type': 'text/html; charset=utf-8', ...extra } }); }
async function internal(namespace: DurableObjectNamespace | undefined, name: string, value: unknown) {
  if (!namespace) throw new AccessDenied();
  const result = await namespace.get(namespace.idFromName(name)).fetch('https://internal.invalid/', { method: 'POST', body: JSON.stringify(value) });
  if (!result.ok) throw new AccessDenied(); return result.json();
}
async function browser(env: AccountBrowserEnv, value: unknown) { return internal(env.ACCOUNT_BROWSER_SESSIONS, 'account-authority-v2', value); }
async function current(env: AccountBrowserEnv, handle: string, fresh = false): Promise<BrowserSession> { const s = await browser(env, { operation: 'load', handle }) as BrowserSession; if (s.version !== 2 || (fresh && Date.now() - s.verifiedAt > 300_000)) throw new AccessDenied(); return s; }
export async function accountAssertion(session: BrowserSession, env: AccountBrowserEnv, handle: string) {
  await browser(env, { operation: 'verify', identity: session.identity });
  const jwk = JSON.parse(env.ACCOUNT_SIGNING_JWK);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) throw new AccessDenied();
  // Bootstrap is an internal binding call. Public routing rejects this path.
  const key = await importJWK(jwk, 'ES256');
  const mint = (generation: number) => new SignJWT({ github_id: session.identity.githubId, service: env.SERVICE, resource: env.RESOURCE, grant_generation: generation }).setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setSubject(session.identity.subject).setIssuer(env.ACCOUNT_ISSUER).setAudience(env.BROKER_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(key);
  const bootstrap = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(session.identity.subject)).fetch(new Request('https://internal.invalid/internal/bootstrap', { method: 'POST', headers: { Authorization: 'Bearer ' + await mint(1) } }));
  if (!bootstrap.ok) throw new AccessDenied();
  const state = await bootstrap.json() as { generation: number; status: string };
  const assertion = await mint(state.generation);
  const final = await current(env, handle); if (final.identity.subject !== session.identity.subject || final.generation !== session.generation || final.accountEpoch !== session.accountEpoch) throw new AccessDenied();
  return { assertion, state };
}
/** Adapter injection is an internal module seam for tests, never a public configuration switch. */
export function createAccountRoutes(adapter?: LoginAdapter) {
  return async (request: Request, env: AccountBrowserEnv, broker: (request: Request) => Promise<Response>): Promise<Response | null> => {
    const url = new URL(request.url), path = url.pathname;
    const repositoryCallback = path === '/oauth/callback' && Boolean(cookie(request, '__Host-account_session'));
    if (!path.startsWith('/account') && !repositoryCallback) return null;
    let activationProof: string | undefined;
    try {
      if (path === '/account/public' && request.method === 'GET') return response('<!doctype html><html lang="en"><title>Public access</title><main><h1>Public access remains available</h1><p>Use your navigator’s public documentation and repositories without signing in.</p><a href="/account">Account access</a></main></html>');
      if (path === '/account/signin' && request.method === 'GET') {
        if (!env.ACCOUNT_BROWSER_SESSIONS || env.PRIVATE_ACTIVATION !== 'owner-verified') return response(accountPage());
        let activeHandle = cookie(request, '__Host-account_session');
        let active: BrowserSession | undefined;
        if (activeHandle) { try { active = await current(env, activeHandle); } catch { activeHandle = ''; } }
        const handle = active ? active.browserHandle : cookie(request, '__Host-account_browser') || opaque();
        if (!/^[a-f0-9]{64}$/.test(handle)) throw new AccessDenied();
        const pending = await browser(env, { operation: 'begin', handle, activeHandle: activeHandle || undefined }) as { nonce: string };
        return response(accountPage({ loginCsrf: pending.nonce }), 200, { 'Set-Cookie': setCookie('__Host-account_browser', handle, 300) });
      }
      if (path === '/account/callback') {
        if (env.PRIVATE_ACTIVATION !== 'owner-verified' || request.method !== 'GET' || url.origin + path !== env.ACCOUNT_LOGIN_CALLBACK) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), nonce = cookie(request, '__Host-account_login');
        const pending = await browser(env, { operation: 'consume', handle, nonce, state: url.searchParams.get('state') ?? '' }) as { transaction: IdentityTransaction; proof: string };
        activationProof = pending.proof;
        const code = url.searchParams.get('code'); if (!code || code.length > 2048) throw new AccessDenied();
        const verified = await login(adapter, env).complete({ url, transaction: pending.transaction });
        const active = await browser(env, { operation: 'activate', githubId: verified.githubId, proof: pending.proof }) as { handle: string };
        activationProof = undefined;
        await current(env, active.handle);
        const result = response('', 303, { Location: '/account', 'Set-Cookie': setCookie('__Host-account_session', active.handle) });
        result.headers.append('Set-Cookie', setCookie('__Host-account_browser', handle, 28_800));
        result.headers.append('Set-Cookie', setCookie('__Host-account_login', '', 0));
        return result;
      }
      if (path === '/account/signin' && request.method === 'POST') {
        if (env.PRIVATE_ACTIVATION !== 'owner-verified' || request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), text = await request.text(); if (text.length > 4096) throw new AccessDenied(); const nonce = new URLSearchParams(text).get('csrf') ?? '';
        const start = await login(adapter, env).begin();
        await browser(env, { operation: 'start', handle, nonce, transaction: start.transaction });
        const target = new URL(start.url); if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize') throw new AccessDenied();
        return response('', 303, { Location: target.toString(), 'Set-Cookie': setCookie('__Host-account_login', nonce, 300) });
      }
      const handle = cookie(request, '__Host-account_session');
      if (path === '/account' && request.method === 'GET' && !handle) return env.ACCOUNT_BROWSER_SESSIONS && env.PRIVATE_ACTIVATION === 'owner-verified' ? response('', 303, { Location: '/account/signin' }) : response(accountPage());
      // A valid retired-handle tombstone may still cancel a replacement that won the callback race.
      // Revoke-all is stricter: the authority DO requires a currently active session.
      if (request.method === 'POST' && (path === '/account/signout' || path === '/account/revoke-all-local-browser-sessions')) {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied();
        await browser(env, { operation: path.endsWith('/signout') ? 'signout' : 'revoke-all-local-browser-sessions', handle, nonce: new URLSearchParams(text).get('csrf') ?? '' });
        return response('', 303, { Location: '/account', 'Set-Cookie': setCookie('__Host-account_session', '', 0) });
      }
      const session = await browser(env, { operation: 'load', handle }) as BrowserSession;
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin || Number(request.headers.get('content-length') ?? 0) > 4096) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied();
        const csrf = new URLSearchParams(text).get('csrf') ?? '';
        await browser(env, { operation: 'csrf', handle, nonce: csrf });
      }
      await browser(env, { operation: 'touch', handle });
      const auth = await accountAssertion(session, env, handle);
      if (repositoryCallback) {
        if (request.method !== 'GET' || url.origin + path !== env.GITHUB_CALLBACK) throw new AccessDenied();
        await browser(env, { operation: 'repository-state', handle, nonce: url.searchParams.get('state') ?? '', consume: true });
        const proof = { handle, generation: session.generation, accountEpoch: session.accountEpoch, subject: session.identity.subject, githubId: session.identity.githubId };
        const result = await broker(new Request(url, { headers: { Authorization: 'Bearer ' + auth.assertion, 'X-Account-Browser-Proof': JSON.stringify(proof) } }));
        if (!result.ok) throw new AccessDenied();
        const candidate = await result.json() as { candidateId: string; subject: string };
        if (candidate.subject !== session.identity.subject) throw new AccessDenied();
        await browser(env, { operation: 'commit-repository', handle, proof, candidateId: candidate.candidateId, assertion: auth.assertion });
        return response('', 303, { Location: '/account' });
      }
      if (path === '/account' && request.method === 'GET') return response(accountPage({ subject: session.identity.subject, csrf: session.csrf, connected: auth.state.status === 'verified' }), 200, { 'Set-Cookie': setCookie('__Host-account_session', handle, Math.max(0, Math.min(1800, Math.floor((session.absoluteUntil - Date.now()) / 1000)))) });
      if (request.method === 'POST' && ['/account/disconnect', '/account/repositories/connect'].includes(path)) {
        if (path.endsWith('/connect')) await current(env, handle, true);
        const target = path.endsWith('/disconnect') ? '/disconnect' : '/oauth/start?purpose=repository';
        const result = await broker(new Request(new URL(target, env.ACCOUNT_ISSUER), { method: 'POST', headers: { Authorization: 'Bearer ' + auth.assertion, Origin: new URL(env.ACCOUNT_ISSUER).origin } }));
        if (!result.ok) throw new AccessDenied();
        await current(env, handle, path.endsWith('/connect'));
        if (path.endsWith('/disconnect')) return response('', 303, { Location: '/account' });
        const targetUrl = new URL((await result.json() as { authorizationUrl: string }).authorizationUrl);
        if (targetUrl.origin !== 'https://github.com' || targetUrl.pathname !== '/login/oauth/authorize' || !targetUrl.searchParams.get('state')) throw new AccessDenied();
        await browser(env, { operation: 'repository-state', handle, nonce: targetUrl.searchParams.get('state') });
        return response('', 303, { Location: targetUrl.toString() });
      }
      throw new AccessDenied();
    } catch { if (activationProof) { try { await browser(env, { operation: 'discard', proof: activationProof }); } catch { /* Failed cleanup is still a denied callback; proof remains bounded and token-free. */ } } return response('<!doctype html><html lang="en"><title>Account unavailable</title><main><h1>Account request could not be confirmed</h1><p>If a connection was in progress, check your account before retrying: an interrupted response does not prove the connection was rolled back. Sign in again to recover the same GitHub identity. To switch accounts, sign out first. Public access remains available.</p><a href="/account">Check account</a><p><a href="/account/signin">Sign in again</a></p><p><a href="/account/public">Continue with public access</a></p></main></html>', 503); }
  };
}
function login(adapter: LoginAdapter | undefined, env: AccountBrowserEnv): LoginAdapter {
  if (adapter) return adapter;
  if (!env.ACCOUNT_LOGIN_CALLBACK || new URL(env.ACCOUNT_LOGIN_CALLBACK).origin !== new URL(env.ACCOUNT_ISSUER).origin || new URL(env.ACCOUNT_LOGIN_CALLBACK).pathname !== '/account/callback') throw new AccessDenied();
  return productionLogin({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, callback: env.ACCOUNT_LOGIN_CALLBACK, fetch: (...args) => fetch(...args) });
}
export const accountRoutes = createAccountRoutes();

/** Browser consent uses the maintained provider's parser and registered-client metadata. */
export function createAccountConsent(_adapter?: LoginAdapter) {
  return async (request: Request, env: AccountBrowserEnv, helpers: import('@cloudflare/workers-oauth-provider').OAuthHelpers, complete: (request: Request) => Promise<Response>): Promise<Response | null> => {
    const handle = cookie(request, '__Host-account_session');
    if (!handle) return request.method === 'GET' && env.PRIVATE_ACTIVATION === 'owner-verified' && env.ACCOUNT_BROWSER_SESSIONS
      ? response('<!doctype html><html lang="en"><title>Sign in to connect</title><main><h1>Sign in to connect</h1><p>Sign in with GitHub and connect repository access, then return to your connector and retry. Public access remains available without signing in.</p><a href="/account/signin">Sign in with GitHub</a><p><a href="/account/public">Continue with public access</a></p></main></html>', 401)
      : response(accountPage(), request.method === 'GET' ? 401 : 403);
    try {
      const here = new URL(request.url);
      if (here.origin !== new URL(env.ACCOUNT_ISSUER).origin || here.pathname !== '/authorize') throw new AccessDenied();
      let authorizationUrl = here.toString(), decision = '';
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== here.origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 8192) throw new AccessDenied();
        const form = new URLSearchParams(text); authorizationUrl = form.get('authorizationUrl') ?? ''; decision = form.get('decision') ?? '';
        await browser(env, { operation: 'csrf', handle, nonce: form.get('csrf') ?? '' });
      } else if (request.method !== 'GET') throw new AccessDenied();
      const target = new URL(authorizationUrl);
      if (target.origin !== here.origin || target.pathname !== '/authorize') throw new AccessDenied();
      const auth = await helpers.parseAuthRequest(new Request(target)), client = await helpers.lookupClient(auth.clientId);
      if (!client || !client.redirectUris.includes(auth.redirectUri) || auth.resource !== env.RESOURCE || auth.scope.length !== 1 || auth.scope[0] !== 'repository:read') throw new AccessDenied();
      const session = await browser(env, { operation: 'load', handle }) as BrowserSession;
      await current(env, handle, true);
      const authz = await accountAssertion(session, env, handle);
      if (authz.state.status !== 'verified') throw new AccessDenied();
      await browser(env, { operation: 'touch', handle });
      if (request.method === 'GET') {
        const { consentPage } = await import('./account-ui');
        return response(consentPage({ client: client.clientName ?? auth.clientId, resource: env.RESOURCE, csrf: session.csrf, authorizationUrl }));
      }
      if (decision === 'deny') {
        const denied = new URL(auth.redirectUri); denied.searchParams.set('error', 'access_denied'); if (auth.state) denied.searchParams.set('state', auth.state);
        return response('', 303, { Location: denied.toString() });
      }
      if (decision !== 'approve') throw new AccessDenied();
      const completed = await browser(env, { operation: 'commit-connector', handle, proof: { handle, generation: session.generation, accountEpoch: session.accountEpoch, subject: session.identity.subject, githubId: session.identity.githubId }, authorizationUrl, assertion: authz.assertion }) as { redirectTo: string };
      const redirect = new URL(completed.redirectTo), allowed = new URL(auth.redirectUri);
      if (redirect.origin !== allowed.origin || redirect.pathname !== allowed.pathname) throw new AccessDenied();
      return response('', 303, { Location: redirect.toString() });
    } catch { return response('<!doctype html><html lang="en"><title>Consent unavailable</title><main><h1>Connection outcome unavailable</h1><p>An interrupted response does not prove a pending connection was rolled back. Verify your account before retrying. Existing connector access is separate from local browser sign-out.</p><a href="/account">Check account</a><p><a href="/account/signin">Verify with GitHub again</a></p><p><a href="/account/public">Continue with public access</a></p></main></html>', 403); }
  };
}
export const accountConsent = createAccountConsent();
