import { importJWK, SignJWT } from 'jose';
import type { AccountEnv } from './broker';
import { AccessDenied } from './session';
import { productionLogin, type LoginAdapter } from './login';
import type { IdentityTransaction } from './oauth';
import { opaque, type BrowserSession, type ContinuationIntent } from './browser-session';
import { accountPage, standalonePage, entryPage, browserHeaders, accountDocument, publicExplorerUrl, escape } from './account-ui';
export interface AccountBrowserEnv extends AccountEnv { ACCOUNT_BROWSER_SESSIONS?: DurableObjectNamespace; ACCOUNT_IDENTITY_REGISTRY?: DurableObjectNamespace; ACCOUNT_LOGIN_CALLBACK?: string; }
const cookie = (request: Request, name: string) => request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? '';
const setCookie = (name: string, value: string, age = 1800) => `${name}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}`;
function response(body: string, status = 200, extra: Record<string, string> = {}) { return new Response(body, { status, headers: { ...browserHeaders(), 'Content-Type': 'text/html; charset=utf-8', ...extra } }); }
function continuationUnavailable(status: number) { return response(entryPage(), status); }
async function internal(namespace: DurableObjectNamespace | undefined, name: string, value: unknown) {
  if (!namespace) throw new AccessDenied();
  const result = await namespace.get(namespace.idFromName(name)).fetch('https://internal.invalid/', { method: 'POST', body: JSON.stringify(value) });
  if (!result.ok) throw new AccessDenied(); return result.json();
}
async function browser(env: AccountBrowserEnv, value: unknown) { return internal(env.ACCOUNT_BROWSER_SESSIONS, 'account-authority-v2', value); }
async function repositoryStartsBlocked(env: AccountBrowserEnv) { try { const status = await browser(env, { operation: 'repository-start-status' }) as { blocked: boolean }; return status.blocked !== false; } catch { return true; } }
function repositoryStartUnavailable() { return response(accountDocument('Repository connections unavailable', '<h1>New repository connections are temporarily unavailable.</h1><p>A connection may have completed even if this page did not load. Check your account before starting again. Existing access is separate; canceling does not confirm that a connection failed.</p><a href="/account">Check account</a><p><a href="/account/public">Continue with public access</a></p>'), 503); }
async function current(env: AccountBrowserEnv, handle: string, fresh = false): Promise<BrowserSession> { const s = await browser(env, { operation: 'load', handle }) as BrowserSession; if (s.version !== 2 || (fresh && Date.now() - s.verifiedAt > 300_000)) throw new AccessDenied(); return s; }
const continuationCookie = (request: Request) => cookie(request, '__Host-account_continuation') || undefined;
function single(form: URLSearchParams, key: string) { if (form.getAll(key).length > 1) throw new AccessDenied(); return form.get(key) ?? ''; }
function intentUrl(intent: ContinuationIntent, env: AccountBrowserEnv) { const url = new URL('/authorize', env.ACCOUNT_ISSUER); url.search = new URLSearchParams({ client_id: intent.clientId, redirect_uri: intent.redirectUri, state: intent.state, response_type: intent.responseType, scope: intent.scope.join(' '), resource: intent.resource, code_challenge: intent.codeChallenge, code_challenge_method: intent.codeChallengeMethod }).toString(); return url.toString(); }
async function continuation(env: AccountBrowserEnv, browserHandle: string, ref: string, activeHandle?: string) { return browser(env, { operation: 'continuation-load', handle: browserHandle, ref, activeHandle }) as Promise<{ intent: ContinuationIntent; expiresAt: number; stage: string }>; }
async function providerHelpers(env: AccountBrowserEnv) { if (!env.ACCOUNT_CONNECTOR_KV) throw new AccessDenied(); const { getOAuthApi } = await import('@cloudflare/workers-oauth-provider'); return getOAuthApi({ apiRoute: env.RESOURCE, apiHandler: { fetch: () => new Response('', { status: 403 }) }, defaultHandler: { fetch: () => new Response('', { status: 403 }) }, authorizeEndpoint: env.ACCOUNT_ISSUER + '/authorize', tokenEndpoint: env.ACCOUNT_ISSUER + '/token', resourceMatchOriginOnly: false }, { ...env, OAUTH_KV: env.ACCOUNT_CONNECTOR_KV }); }
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
      if (path === '/account/public' && request.method === 'GET') return response(accountDocument('Public access', '<h1>Public access remains available</h1><p>Cartographer’s public explorer can be opened without this account sign-in. Private repositories require separate authorized access.</p><a href="' + escape(publicExplorerUrl(env.RESOURCE)) + '">Open Cartographer public explorer</a><p><a href="/account">Account access</a></p>'));
      if (path === '/account/continuation/cancel' && request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied(); const form = new URLSearchParams(text), ref = single(form, 'continuation');
        if (!ref || ref !== continuationCookie(request)) throw new AccessDenied();
        let activeHandle = cookie(request, '__Host-account_session'); try { await current(env, activeHandle); } catch { activeHandle = ''; }
        await browser(env, { operation: 'continuation-cancel', handle: cookie(request, '__Host-account_browser'), ref, nonce: single(form, 'csrf'), activeHandle: activeHandle || undefined });
        if (await repositoryStartsBlocked(env)) return repositoryStartUnavailable();
        return response('', 303, { Location: '/account/public', 'Set-Cookie': setCookie('__Host-account_continuation', '', 0) });
      }
      if (path === '/account/signin' && request.method === 'GET') {
        if (!env.ACCOUNT_BROWSER_SESSIONS || env.PRIVATE_ACTIVATION !== 'owner-verified') return response(accountPage());
        const restart = single(url.searchParams, 'restart'); if (restart && restart !== 'standalone') throw new AccessDenied();
        if (restart === 'standalone') {
          const handle = cookie(request, '__Host-account_browser') || (cookie(request, '__Host-account_session') ? '' : opaque()), continuationRef = continuationCookie(request);
          const pending = await browser(env, { operation: 'begin', handle, activeHandle: cookie(request, '__Host-account_session') || undefined, continuationRef, restart: true }) as { nonce: string; browserHandle: string };
          return response(standalonePage(pending.nonce, continuationRef), 200, { 'Set-Cookie': setCookie('__Host-account_browser', pending.browserHandle, 28_800) });
        }
        const activeHandle = cookie(request, '__Host-account_session') || undefined;
        const handle = cookie(request, '__Host-account_browser') || (activeHandle ? '' : opaque()), continuationRef = continuationCookie(request);
        const pending = await browser(env, { operation: 'begin', handle, activeHandle, continuationRef }) as { nonce: string; browserHandle: string };
        return response(accountPage({ loginCsrf: pending.nonce, continuationRef }), 200, { 'Set-Cookie': setCookie('__Host-account_browser', pending.browserHandle, 28_800) });
      }
      if (path === '/account/callback') {
        if (env.PRIVATE_ACTIVATION !== 'owner-verified' || request.method !== 'GET' || url.origin + path !== env.ACCOUNT_LOGIN_CALLBACK) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), nonce = cookie(request, '__Host-account_login');
        const continuationRef = continuationCookie(request);
        const pending = await browser(env, { operation: 'consume', handle, nonce, state: single(url.searchParams, 'state'), continuationRef }) as { transaction: IdentityTransaction; proof: string; continuation: boolean; standalone: boolean };
        activationProof = pending.proof;
        const code = url.searchParams.get('code'); if (!code || code.length > 2048) throw new AccessDenied();
        const verified = await login(adapter, env).complete({ url, transaction: pending.transaction });
        const active = await browser(env, { operation: 'activate', githubId: verified.githubId, proof: pending.proof }) as { handle: string };
        activationProof = undefined;
        await current(env, active.handle);
        const result = response('', 303, { Location: pending.continuation ? '/account/continue' : '/account', 'Set-Cookie': setCookie('__Host-account_session', active.handle) });
        result.headers.append('Set-Cookie', setCookie('__Host-account_browser', handle, 28_800));
        result.headers.append('Set-Cookie', setCookie('__Host-account_login', '', 0));
        return result;
      }
      if (path === '/account/signin/restart/cancel' && request.method === 'POST') {
        if (env.PRIVATE_ACTIVATION !== 'owner-verified' || request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied(); const form = new URLSearchParams(text);
        if (single(form, 'restart') !== 'standalone') throw new AccessDenied();
        await browser(env, { operation: 'restart-cancel', handle: cookie(request, '__Host-account_browser'), nonce: single(form, 'csrf'), continuationRef: single(form, 'continuation') || undefined });
        return response('', 303, { Location: '/account/public' });
      }
      if (path === '/account/signin' && request.method === 'POST') {
        if (env.PRIVATE_ACTIVATION !== 'owner-verified' || request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const handle = cookie(request, '__Host-account_browser'), text = await request.text(); if (text.length > 4096) throw new AccessDenied(); const form = new URLSearchParams(text), nonce = single(form, 'csrf'), continuationRef = single(form, 'continuation') || undefined;
        const mode = single(form, 'restart'); if (mode && mode !== 'standalone') throw new AccessDenied(); const restart = mode === 'standalone';
        if (!restart && continuationRef !== continuationCookie(request)) throw new AccessDenied();
        const start = await login(adapter, env).begin();
        await browser(env, { operation: 'start', handle, nonce, transaction: start.transaction, continuationRef, restart });
        const target = new URL(start.url); if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize') throw new AccessDenied();
        return response('', 303, { Location: target.toString(), 'Set-Cookie': setCookie('__Host-account_login', nonce, 300) });
      }
      const handle = cookie(request, '__Host-account_session');
      let accountContinuation: string | undefined;
      if (path === '/account/continue' && request.method === 'GET') {
        const ref = continuationCookie(request); if (!ref) throw new AccessDenied();
        await continuation(env, cookie(request, '__Host-account_browser'), ref);
        try { await current(env, handle, true); } catch { return response('', 303, { Location: '/account/signin' }); }
      }
      if (path === '/account' && request.method === 'GET') {
        if (!env.ACCOUNT_BROWSER_SESSIONS || env.PRIVATE_ACTIVATION !== 'owner-verified') return response(accountPage());
        const entry = await browser(env, { operation: 'entry', handle: cookie(request, '__Host-account_browser') || (handle ? '' : opaque()), activeHandle: handle || undefined, continuationRef: continuationCookie(request) }) as { kind: string; signoutCsrf?: string; live?: boolean };
        if (entry.kind === 'anonymous') return response('', 303, { Location: '/account/signin' });
        if (entry.kind !== 'active') return response(entryPage(entry.kind, entry.signoutCsrf, await repositoryStartsBlocked(env)));
        if (entry.live) accountContinuation = continuationCookie(request);
      }
      // A valid retired-handle tombstone may still cancel a replacement that won the callback race.
      // Revoke-all is stricter: the authority DO requires a currently active session.
      if (request.method === 'POST' && (path === '/account/signout' || path === '/account/revoke-all-local-browser-sessions')) {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied();
        await browser(env, { operation: path.endsWith('/signout') ? 'signout' : 'revoke-all-local-browser-sessions', handle, nonce: new URLSearchParams(text).get('csrf') ?? '' });
        const result = response('', 303, { Location: '/account', 'Set-Cookie': setCookie('__Host-account_session', '', 0) }); result.headers.append('Set-Cookie', setCookie('__Host-account_continuation', '', 0)); return result;
      }
      const session = await browser(env, { operation: 'load', handle }) as BrowserSession;
      let formContinuation: string | undefined, accountLease: string | undefined, connectorLease: string | undefined;
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== new URL(env.ACCOUNT_ISSUER).origin || Number(request.headers.get('content-length') ?? 0) > 4096) throw new AccessDenied();
        const text = await request.text(); if (text.length > 4096) throw new AccessDenied();
        const form = new URLSearchParams(text), csrf = single(form, 'csrf'); formContinuation = single(form, 'continuation') || undefined;
        const purpose = single(form, 'purpose');
        if (path === '/account/repositories/cancel') {
          if (purpose !== 'account' || formContinuation) throw new AccessDenied();
          await browser(env, { operation: 'repository-account-cancel', handle, lease: single(form, 'lease'), nonce: csrf }); if (await repositoryStartsBlocked(env)) return repositoryStartUnavailable(); return response('', 303, { Location: '/account' });
        }
        if (path === '/account/repositories/connect' && purpose === 'account') {
          if (formContinuation) throw new AccessDenied();
          accountLease = (await browser(env, { operation: 'repository-account-prepare', handle, nonce: csrf, continuationRef: continuationCookie(request) }) as { lease: string }).lease;
        } else {
          if (purpose) throw new AccessDenied();
          if (path === '/account/repositories/connect' && !formContinuation) throw new AccessDenied();
          if (path === '/account/repositories/connect' && formContinuation !== continuationCookie(request)) throw new AccessDenied();
          if (path === '/account/repositories/connect') connectorLease = (await browser(env, { operation: 'repository-connector-prepare', handle, nonce: csrf, continuationRef: formContinuation }) as { lease: string }).lease;
          else { if (formContinuation) await continuation(env, session.browserHandle, formContinuation, handle); await browser(env, { operation: 'csrf', handle, nonce: csrf }); }
        }
      }
      await browser(env, { operation: 'touch', handle });
      const auth = await accountAssertion(session, env, handle);
      if (path === '/account/continue' && request.method === 'GET') {
        const ref = continuationCookie(request)!, c = await continuation(env, session.browserHandle, ref, handle);
        const helpers = await providerHelpers(env), client = await helpers.lookupClient(c.intent.clientId);
        if (!client || !client.redirectUris.includes(c.intent.redirectUri) || c.intent.resource !== env.RESOURCE) throw new AccessDenied();
        await browser(env, { operation: 'continuation-stage', handle, ref, next: auth.state.status === 'verified' ? 'ready_for_connector' : 'awaiting_repository' });
        if (auth.state.status !== 'verified') return response(accountPage({ subject: session.identity.subject, csrf: session.csrf, connected: false, continuationRef: ref, repositoryStartsBlocked: await repositoryStartsBlocked(env) }));
        const { consentPage } = await import('./account-ui'); return response(consentPage({ client: client.clientName ?? c.intent.clientId, resource: env.RESOURCE, csrf: session.csrf, authorizationUrl: '', continuationRef: ref }));
      }
      if (repositoryCallback) {
        if (request.method !== 'GET' || url.origin + path !== env.GITHUB_CALLBACK) throw new AccessDenied();
        const continuationRef = continuationCookie(request);
        const captured = await browser(env, { operation: 'repository-state', handle, nonce: single(url.searchParams, 'state'), consume: true, continuationRef }) as { purpose: 'account' | 'connector'; lease?: string };
        const proof = { handle, generation: session.generation, accountEpoch: session.accountEpoch, subject: session.identity.subject, githubId: session.identity.githubId };
        const result = await broker(new Request(url, { headers: { Authorization: 'Bearer ' + auth.assertion, 'X-Account-Browser-Proof': JSON.stringify(proof) } }));
        if (!result.ok) throw new AccessDenied();
        const candidate = await result.json() as { candidateId: string; subject: string };
        if (candidate.subject !== session.identity.subject) throw new AccessDenied();
        await browser(env, { operation: 'commit-repository', handle, proof, candidateId: candidate.candidateId, assertion: auth.assertion, ...(captured.purpose === 'account' ? { lease: captured.lease } : { continuationRef }) });
        return response('', 303, { Location: captured.purpose === 'account' ? '/account' : continuationRef ? '/account/continue' : '/account' });
      }
      if (path === '/account' && request.method === 'GET') return response(accountPage({ subject: session.identity.subject, csrf: session.csrf, connected: auth.state.status === 'verified', liveContinuation: accountContinuation, repositoryStartsBlocked: await repositoryStartsBlocked(env), repositoryLease: session.repositoryState?.purpose === 'account' && session.repositoryState.expiresAt > Date.now() ? session.repositoryState : undefined }), 200, { 'Set-Cookie': setCookie('__Host-account_session', handle, Math.max(0, Math.min(1800, Math.floor((session.absoluteUntil - Date.now()) / 1000)))) });
      if (request.method === 'POST' && ['/account/disconnect', '/account/repositories/connect'].includes(path)) {
        if (path.endsWith('/connect')) {
          const started = await browser(env, { operation: 'repository-start', handle, lease: accountLease ?? connectorLease, purpose: accountLease ? 'account' : 'connector', ...(accountLease ? {} : { continuationRef: formContinuation }), assertion: auth.assertion }) as { authorizationUrl: string };
          return response('', 303, { Location: started.authorizationUrl });
        }
        const result = await broker(new Request(new URL('/disconnect', env.ACCOUNT_ISSUER), { method: 'POST', headers: { Authorization: 'Bearer ' + auth.assertion, Origin: new URL(env.ACCOUNT_ISSUER).origin } }));
        if (!result.ok) throw new AccessDenied();
        await current(env, handle); return response('', 303, { Location: '/account' });
      }
      throw new AccessDenied();
    } catch { if (['/account/repositories/connect', '/account/repositories/cancel', '/account/continuation/cancel', '/account'].includes(path) && await repositoryStartsBlocked(env)) return repositoryStartUnavailable(); if (activationProof) { try { await browser(env, { operation: 'discard', proof: activationProof }); } catch { /* Failed cleanup is still a denied callback; proof remains bounded and token-free. */ } } if (path === '/account' || path === '/account/signin') return response(entryPage(), 503); if (continuationCookie(request)) return continuationUnavailable(503); return response(accountDocument('Account unavailable', '<h1>Account request could not be confirmed</h1><p>If a connection was in progress, it may have completed even if this page did not load. Check your account before starting again. Sign in again to recover the same GitHub identity. To switch accounts, sign out first. Public access remains available.</p><a href="/account">Check account</a><p><a href="/account/signin">Sign in again</a></p><p><a href="/account/public">Continue with public access</a></p>'), 503); }
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
    if (!handle && request.method !== 'GET') return response(accountPage(), 403);
    try {
      const here = new URL(request.url);
      if (here.origin !== new URL(env.ACCOUNT_ISSUER).origin || here.pathname !== '/authorize') throw new AccessDenied();
      if (env.PRIVATE_ACTIVATION !== 'owner-verified') throw new AccessDenied();
      let authorizationUrl = here.toString(), decision = '', continuationRef: string | undefined;
      if (request.method === 'POST') {
        if (request.headers.get('Origin') !== here.origin) throw new AccessDenied();
        const text = await request.text(); if (text.length > 8192) throw new AccessDenied();
        const form = new URLSearchParams(text); continuationRef = single(form, 'continuation') || undefined; authorizationUrl = single(form, 'authorizationUrl'); decision = single(form, 'decision');
        if (continuationRef !== continuationCookie(request)) throw new AccessDenied();
        if (continuationRef) {
          if (authorizationUrl || continuationRef !== continuationCookie(request)) throw new AccessDenied();
          const s = await current(env, handle), c = await continuation(env, s.browserHandle, continuationRef, handle); authorizationUrl = intentUrl(c.intent, env);
        }
        await browser(env, { operation: 'csrf', handle, nonce: single(form, 'csrf') });
      } else if (request.method !== 'GET') throw new AccessDenied();
      const target = new URL(authorizationUrl);
      if (target.origin !== here.origin || target.pathname !== '/authorize') throw new AccessDenied();
      const allowedParameters = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'resource', 'code_challenge', 'code_challenge_method', 'ui_locales'];
      if ([...target.searchParams.keys()].some(key => !allowedParameters.includes(key) || target.searchParams.getAll(key).length !== 1)) throw new AccessDenied();
      // Optional host presentation hint, never part of authorization or continuation custody.
      // Validate a bounded locale list with the runtime's maintained language-tag parser.
      if (target.searchParams.has('ui_locales')) {
        const locales = single(target.searchParams, 'ui_locales');
        const tags = locales.split(' ');
        if (!locales || locales.length > 256 || tags.length > 8 || tags.some(tag => !tag || /[^A-Za-z0-9-]/.test(tag))) throw new AccessDenied();
        Intl.getCanonicalLocales(tags); // Malformed language tags throw into the denial path.
        target.searchParams.delete('ui_locales');
        authorizationUrl = target.toString();
      }
      const auth = await helpers.parseAuthRequest(new Request(target)), client = await helpers.lookupClient(auth.clientId);
      if (!client || !client.redirectUris.includes(auth.redirectUri) || auth.resource !== env.RESOURCE || auth.scope.length !== 1 || auth.scope[0] !== 'repository:read') throw new AccessDenied();
      let session: BrowserSession | undefined;
      try { session = await current(env, handle); } catch { /* GET may begin identity bootstrap, never authority. */ }
      let authz = session && Date.now() - session.verifiedAt <= 300000 ? await accountAssertion(session, env, handle) : undefined;
      if (request.method === 'GET' && (!session || Date.now() - session.verifiedAt > 300000 || authz?.state.status !== 'verified' || continuationCookie(request))) {
        if (!env.ACCOUNT_BROWSER_SESSIONS || auth.responseType !== 'code' || auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge || !auth.state) throw new AccessDenied();
        const browserHandle = session?.browserHandle ?? (cookie(request, '__Host-account_browser') || opaque());
        const intent: ContinuationIntent = { clientId: auth.clientId, redirectUri: auth.redirectUri, state: auth.state, responseType: 'code', codeChallenge: auth.codeChallenge, codeChallengeMethod: 'S256', resource: env.RESOURCE, scope: ['repository:read'] };
        const created = await browser(env, { operation: 'continuation-create', handle: browserHandle, activeHandle: session ? handle : undefined, intent }) as { ref: string };
        const result = response('', 303, { Location: '/account/continue', 'Set-Cookie': setCookie('__Host-account_browser', browserHandle, 28800) });
        result.headers.append('Set-Cookie', setCookie('__Host-account_continuation', created.ref, 300)); return result;
      }
      if (!session) throw new AccessDenied();
      await current(env, handle, true);
      authz ??= await accountAssertion(session, env, handle);
      if (authz.state.status !== 'verified') throw new AccessDenied();
      await browser(env, { operation: 'touch', handle });
      if (request.method === 'GET') {
        const { consentPage } = await import('./account-ui');
        return response(consentPage({ client: client.clientName ?? auth.clientId, resource: env.RESOURCE, csrf: session.csrf, authorizationUrl }));
      }
      if (decision === 'deny') {
        if (continuationRef) await browser(env, { operation: 'continuation-retire', handle: session.browserHandle, ref: continuationRef });
        const denied = new URL(auth.redirectUri); denied.searchParams.set('error', 'access_denied'); if (auth.state) denied.searchParams.set('state', auth.state);
        return response('', 303, { Location: denied.toString() });
      }
      if (decision !== 'approve') throw new AccessDenied();
      const completed = await browser(env, { operation: 'commit-connector', handle, proof: { handle, generation: session.generation, accountEpoch: session.accountEpoch, subject: session.identity.subject, githubId: session.identity.githubId }, ...(continuationRef ? { continuationRef } : { authorizationUrl }), assertion: authz.assertion }) as { redirectTo: string };
      const redirect = new URL(completed.redirectTo), allowed = new URL(auth.redirectUri);
      if (redirect.origin !== allowed.origin || redirect.pathname !== allowed.pathname) throw new AccessDenied();
      return response('', 303, { Location: redirect.toString(), ...(continuationRef ? { 'Set-Cookie': setCookie('__Host-account_continuation', '', 0) } : {}) });
    } catch { if (continuationCookie(request)) return continuationUnavailable(403); return response(accountDocument('Consent unavailable', '<h1>Connection outcome unavailable</h1><p>The connection may have completed even if this page did not load. Check your account before starting again. Signing out of this browser does not end existing connector access.</p><a href="/account">Check account</a><p><a href="/account/signin">Verify with GitHub again</a></p><p><a href="/account/public">Continue with public access</a></p>'), 403); }
  };
}
export const accountConsent = createAccountConsent();
