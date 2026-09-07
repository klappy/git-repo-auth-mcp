import { importJWK, SignJWT } from 'jose';
import type { AccountEnv } from './broker';
import { AccessDenied } from './session';
import { productionLogin, type ManagedLoginAdapter } from './login';
import { opaque, type BrowserSession } from './browser-session';
import { accountPage, browserHeaders } from './account-ui';
export interface AccountBrowserEnv extends AccountEnv { ACCOUNT_BROWSER_SESSIONS?: DurableObjectNamespace; ACCOUNT_IDENTITY_REGISTRY?: DurableObjectNamespace; ACCOUNT_LOGIN_CALLBACK?: string; SUPABASE_URL?: string; }
const cookie = (request: Request, name: string) => request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? '';
const setCookie = (name: string, value: string, age = 1800) => `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}`;
function response(body: string, status = 200, extra: Record<string, string> = {}) { return new Response(body, { status, headers: { ...browserHeaders(), 'Content-Type': 'text/html; charset=utf-8', ...extra } }); }
async function internal(namespace: DurableObjectNamespace | undefined, name: string, value: unknown) {
  if (!namespace) throw new AccessDenied();
  const result = await namespace.get(namespace.idFromName(name)).fetch('https://internal.invalid/', { method: 'POST', body: JSON.stringify(value) });
  if (!result.ok) throw new AccessDenied(); return result.json();
}
async function browser(env: AccountBrowserEnv, value: unknown) { return internal(env.ACCOUNT_BROWSER_SESSIONS, 'browser-sessions-v1', value); }
export async function accountAssertion(session: BrowserSession, env: AccountBrowserEnv) {
  await internal(env.ACCOUNT_IDENTITY_REGISTRY, 'identity-registry-v1', { operation: 'verify', identity: session.identity });
  const jwk = JSON.parse(env.ACCOUNT_SIGNING_JWK);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.kid) throw new AccessDenied();
  // Bootstrap is an internal binding call. Public routing rejects this path.
  const key = await importJWK(jwk, 'ES256');
  const mint = (generation: number) => new SignJWT({ github_id: session.identity.githubId, service: env.SERVICE, resource: env.RESOURCE, grant_generation: generation }).setProtectedHeader({ alg: 'ES256', kid: jwk.kid }).setSubject(session.identity.subject).setIssuer(env.ACCOUNT_ISSUER).setAudience(env.BROKER_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(key);
  const bootstrap = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(session.identity.subject)).fetch(new Request('https://internal.invalid/internal/bootstrap', { method: 'POST', headers: { Authorization: 'Bearer ' + await mint(1) } }));
  if (!bootstrap.ok) throw new AccessDenied();
  const state = await bootstrap.json() as { generation: number; status: string };
  return { assertion: await mint(state.generation), state };
}
/** Adapter injection is an internal module seam for review/tests; production always binds unavailable. */
export function createAccountRoutes(adapter: ManagedLoginAdapter) {
  return async (request: Request, env: AccountBrowserEnv, broker: (request: Request) => Promise<Response>): Promise<Response | null> => {
    const url = new URL(request.url), path = url.pathname;
    const repositoryCallback = path === '/oauth/callback' && Boolean(cookie(request, '__Host-account_session'));
    if (!path.startsWith('/account') && !repositoryCallback) return null;
    try {
      if (path === '/account/public' && request.method === 'GET') return response('<!doctype html><html lang="en"><title>Public access</title><main><h1>Public access remains available</h1><p>Use your navigator’s public documentation and repositories without signing in.</p><a href="/account">Account access</a></main></html>');
      if (path === '/account/signin' && request.method === 'GET') {
        if (adapter === productionLogin) return response(accountPage());
        const handle = cookie(request, '__Host-account_browser') || opaque();
        const pending = await browser(env, { operation: 'begin', handle }) as { nonce: string };
        return response(accountPage({ loginCsrf: pending.nonce }), 200, { 'Set-Cookie': setCookie('__Host-account_browser', handle, 300) });
      }
      if (path === '/account/callback') {
        // No unsupported provider result, caller identity, or code can initialize production sessions.
        if (adapter === productionLogin || request.method !== 'GET' || url.origin + path !== env.ACCOUNT_LOGIN_CALLBACK) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), nonce = cookie(request, '__Host-account_login');
        const pending = await browser(env, { operation: 'consume', handle, nonce }) as { verifier?: string };
        const code = url.searchParams.get('code'); if (!code || code.length > 2048) throw new AccessDenied();
        const verified = await adapter.complete({ code, verifier: pending.verifier });
        await internal(env.ACCOUNT_IDENTITY_REGISTRY, 'identity-registry-v1', { operation: 'bind', identity: verified.identity });
        const active = await browser(env, { operation: 'activate', identity: verified.identity, managed: verified.managed }) as { handle: string };
        return response('', 303, { Location: '/account', 'Set-Cookie': setCookie('__Host-account_session', active.handle) });
      }
      if (path === '/account/signin' && request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin || adapter === productionLogin) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), form = await request.formData(), nonce = String(form.get('csrf') ?? '');
        await browser(env, { operation: 'start', handle, nonce });
        const start = await adapter.begin({ browser: handle, nonce });
        const target = new URL(start.url); if (!env.SUPABASE_URL || target.origin !== new URL(env.SUPABASE_URL).origin || target.protocol !== 'https:') throw new AccessDenied();
        return response('', 303, { Location: target.toString(), 'Set-Cookie': setCookie('__Host-account_login', nonce, 300) });
      }
      const handle = cookie(request, '__Host-account_session');
      if (path === '/account' && request.method === 'GET' && !handle) return response(accountPage());
      const session = await browser(env, { operation: 'load', handle }) as BrowserSession;
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin || Number(request.headers.get('content-length') ?? 0) > 4096) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied();
        const csrf = new URLSearchParams(text).get('csrf') ?? '';
        await browser(env, { operation: 'csrf', handle, nonce: csrf });
        if (path === '/account/signout') {
          await browser(env, { operation: 'invalidate', handle });
          try { await adapter.signout(session.managed); } catch { /* Local invalidation is authoritative. */ }
          return response('', 303, { Location: '/account', 'Set-Cookie': setCookie('__Host-account_session', '', 0) });
        }
      }
      const verified = await adapter.revalidate(session.managed);
      if (verified.identity.subject !== session.identity.subject || verified.identity.githubId !== session.identity.githubId) throw new AccessDenied();
      const auth = await accountAssertion(session, env);
      if (repositoryCallback) {
        if (request.method !== 'GET' || url.origin + path !== env.GITHUB_CALLBACK) throw new AccessDenied();
        await browser(env, { operation: 'repository-state', handle, nonce: url.searchParams.get('state') ?? '', consume: true });
        const result = await broker(new Request(url, { headers: { Authorization: 'Bearer ' + auth.assertion } }));
        if (!result.ok) throw new AccessDenied();
        return response('', 303, { Location: '/account' });
      }
      if (path === '/account' && request.method === 'GET') return response(accountPage({ subject: session.identity.subject, csrf: session.csrf, connected: auth.state.status === 'verified' }));
      if (request.method === 'POST' && ['/account/disconnect', '/account/repositories/connect'].includes(path)) {
        const target = path.endsWith('/disconnect') ? '/disconnect' : '/oauth/start?purpose=repository';
        const result = await broker(new Request(new URL(target, env.ACCOUNT_ISSUER), { method: 'POST', headers: { Authorization: 'Bearer ' + auth.assertion, Origin: new URL(env.ACCOUNT_ISSUER).origin } }));
        if (!result.ok) throw new AccessDenied();
        if (path.endsWith('/disconnect')) return response('', 303, { Location: '/account' });
        const targetUrl = new URL((await result.json() as { authorizationUrl: string }).authorizationUrl);
        if (targetUrl.origin !== 'https://github.com' || targetUrl.pathname !== '/login/oauth/authorize' || !targetUrl.searchParams.get('state')) throw new AccessDenied();
        await browser(env, { operation: 'repository-state', handle, nonce: targetUrl.searchParams.get('state') });
        return response('', 303, { Location: targetUrl.toString() });
      }
      throw new AccessDenied();
    } catch { return response('<!doctype html><html lang="en"><title>Account unavailable</title><main><h1>Account access unavailable</h1><p>No access was granted. Public access remains available.</p><a href="/account/public">Continue with public access</a></main></html>', 503); }
  };
}
export const accountRoutes = createAccountRoutes(productionLogin);
