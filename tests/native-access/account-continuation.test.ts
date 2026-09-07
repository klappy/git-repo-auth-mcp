import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { BrowserSessions, AccountBrowserSessions, type ContinuationIntent } from '../../account/browser-session';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { harness } from './worker-harness';
import { calculatePKCECodeChallenge, generateRandomCodeVerifier } from 'oauth4webapi';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') this.data.set(key, structuredClone(value)); else for (const [k, v] of Object.entries(key)) this.data.set(k, structuredClone(v)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>; }
  async transaction<T>(fn: (tx: DurableObjectTransaction) => Promise<T>) { const old = new Map(this.data); try { return await fn(this as unknown as DurableObjectTransaction); } catch (error) { this.data = old; throw error; } }
  durable() { return this as unknown as DurableObjectStorage; }
}
const browser = 'a'.repeat(64);
const intent: ContinuationIntent = { clientId: 'fixture', redirectUri: 'https://client.example.test/callback', state: 'original-client-state', responseType: 'code', codeChallenge: 'c'.repeat(43), codeChallengeMethod: 'S256', resource: 'https://navigator.example.test/mcp', scope: ['repository:read'] };
const transaction = () => ({ kind: 'identity-bootstrap' as const, state: crypto.randomUUID(), verifier: 'INERT_VERIFIER', callback: 'https://account.example.test/account/callback', expiresAt: Date.now() + 300000 });
async function setup() {
  const storage = new Storage(), store = new BrowserSessions(storage.durable(), new Uint8Array(32).fill(0xab));
  const issue = async (ref?: string, activeHandle?: string, githubId = 1001) => { const p = await store.begin(browser, activeHandle, ref), tx = transaction(); await store.start(browser, p.nonce, tx, ref); return store.activate(githubId, (await store.consume(browser, p.nonce, tx.state, ref)).proof); };
  return { storage, store, issue };
}
it('exact continuation survives identity rotation, retains original intent and spends at most once across restart', async () => {
  const h = await setup(), c = await h.store.createContinuation(browser, intent), active = await h.issue(c.ref);
  expect((await h.store.loadContinuation(browser, c.ref, active.handle)).intent).toEqual(intent);
  expect(JSON.stringify([...h.storage.data.values()])).not.toMatch(/original-client-state|INERT_VERIFIER|https:\/\/client/);
  await h.store.stageContinuation(active.handle, c.ref, 'ready_for_connector');
  expect(await h.store.spendContinuation(active.handle, c.ref)).toEqual(intent);
  // Simulate process loss immediately after durable spend and before any provider completion.
  const restarted = new BrowserSessions(h.storage.durable(), new Uint8Array(32).fill(0xab));
  await expect(restarted.loadContinuation(browser, c.ref, active.handle)).rejects.toThrow();
  await expect(restarted.spendContinuation(active.handle, c.ref)).rejects.toThrow();
});
it('replacement during paused identity exchange cannot bind, consume or erase the new intent', async () => {
  const h = await setup(), old = await h.store.createContinuation(browser, intent), p = await h.store.begin(browser, undefined, old.ref), tx = transaction();
  await h.store.start(browser, p.nonce, tx, old.ref); const proof = await h.store.consume(browser, p.nonce, tx.state, old.ref);
  const next = await h.store.createContinuation(browser, { ...intent, state: 'replacement' });
  await expect(h.store.activate(1001, proof.proof)).rejects.toThrow();
  await h.store.retireContinuation(browser, old.ref);
  expect((await h.store.loadContinuation(browser, next.ref)).intent?.state).toBe('replacement');
  await expect(h.store.loadContinuation(browser, old.ref)).rejects.toThrow();
});
it('repository-state captures exact ref, and replacement during provider I/O denies final commit', async () => {
  const h = await setup(), active = await h.issue(), old = await h.store.createContinuation(browser, intent, active.handle);
  await h.store.stageContinuation(active.handle, old.ref, 'awaiting_repository');
  await h.store.repositoryCallback(active.handle, 'repository-state', false, old.ref);
  await h.store.repositoryCallback(active.handle, 'repository-state', true, old.ref);
  const next = await h.store.createContinuation(browser, { ...intent, state: 'next' }, active.handle);
  const s = await h.store.load(active.handle), fetch = vi.fn(async () => Response.json({ generation: 2 }));
  const object = new AccountBrowserSessions({ storage: h.storage.durable(), blockConcurrencyWhile: async (fn: () => Promise<Response>) => fn() } as unknown as DurableObjectState, { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_GRANTS: { idFromName: (s: string) => s, get: () => ({ fetch }) } } as never);
  const result = await object.fetch(new Request('https://internal.invalid', { method: 'POST', body: JSON.stringify({ operation: 'commit-repository', handle: active.handle, proof: { handle: active.handle, generation: s.generation, accountEpoch: s.accountEpoch, subject: s.identity.subject, githubId: 1001 }, continuationRef: old.ref, candidateId: crypto.randomUUID(), assertion: 'INERT' }) }));
  expect(result.status).toBe(403); expect(fetch).not.toHaveBeenCalled(); expect((await h.store.loadContinuation(browser, next.ref, active.handle)).intent?.state).toBe('next');
});
it('expired session recovery never downgrades trusted continuation identity; expiry and revoke fail closed', async () => {
  const h = await setup(), active = await h.issue();
  vi.useFakeTimers(); try {
    vi.setSystemTime(Date.now() + 1700000); const c = await h.store.createContinuation(browser, intent, active.handle);
    vi.setSystemTime(Date.now() + 100001); await expect(h.store.load(active.handle)).rejects.toThrow();
    const recovered = await h.issue(c.ref); expect((await h.store.load(recovered.handle)).identity.githubId).toBe(1001);
    await h.store.signout(recovered.handle, recovered.csrf, true); await expect(h.store.loadContinuation(browser, c.ref)).rejects.toThrow();
    const c2 = await h.store.createContinuation(browser, intent); vi.setSystemTime(Date.now() + 300001); await expect(h.store.loadContinuation(browser, c2.ref)).rejects.toThrow();
  } finally { vi.useRealTimers(); }
});
it('wrong identity retires only the captured continuation and Unicode/admission are bounded', async () => {
  const h = await setup(), active = await h.issue(), c = await h.store.createContinuation(browser, intent, active.handle);
  await expect(h.issue(c.ref, active.handle, 1002)).rejects.toThrow(); await expect(h.store.loadContinuation(browser, c.ref)).rejects.toThrow();
  await expect(h.store.createContinuation(browser, { ...intent, state: '界'.repeat(3000) }, active.handle)).rejects.toThrow();
  for (let n = 0; n < 9; n++) await h.store.createContinuation(browser, { ...intent, state: String(n) }, active.handle);
  await expect(h.store.createContinuation(browser, intent, active.handle)).rejects.toThrow();
});
it('recognized old callback cannot burn replacement login, while cancel binds exact ref and nonce', async () => {
  const h = await setup(), old = await h.store.createContinuation(browser, intent), p = await h.store.begin(browser, undefined, old.ref), tx = transaction(); await h.store.start(browser, p.nonce, tx, old.ref);
  const next = await h.store.createContinuation(browser, { ...intent, state: 'next' }), nextP = await h.store.begin(browser, undefined, next.ref), nextTx = transaction(); await h.store.start(browser, nextP.nonce, nextTx, next.ref);
  await expect(h.store.consume(browser, nextP.nonce, tx.state, next.ref)).rejects.toThrow();
  await expect(h.store.cancelContinuation(browser, old.ref, p.nonce)).rejects.toThrow();
  const proof = await h.store.consume(browser, nextP.nonce, nextTx.state, next.ref); expect((await h.store.activate(1001, proof.proof)).handle).toBeTruthy();
  const third = await h.store.createContinuation(browser, { ...intent, state: 'cancel' }), thirdP = await h.store.begin(browser, undefined, third.ref);
  await expect(h.store.cancelContinuation(browser, third.ref, 'wrong')).rejects.toThrow(); await h.store.cancelContinuation(browser, third.ref, thirdP.nonce); await expect(h.store.loadContinuation(browser, third.ref)).rejects.toThrow();
});
it('reauthentication cancellation accepts only its exact pending nonce even with an active session cookie', async () => {
  const h = await setup(), active = await h.issue(), c = await h.store.createContinuation(browser, intent, active.handle), p = await h.store.begin(browser, active.handle, c.ref);
  await expect(h.store.cancelContinuation(browser, c.ref, 'wrong', active.handle)).rejects.toThrow();
  await h.store.cancelContinuation(browser, c.ref, p.nonce, active.handle); await expect(h.store.loadContinuation(browser, c.ref)).rejects.toThrow(); expect((await h.store.load(active.handle)).identity.githubId).toBe(1001);
});
it('consumed expired/superseded login proof cannot cancel a replacement; active session CSRF remains valid', async () => {
  const h = await setup(), active = await h.issue(), old = await h.store.createContinuation(browser, intent, active.handle), p = await h.store.begin(browser, active.handle, old.ref), tx = transaction();
  await h.store.start(browser, p.nonce, tx, old.ref); await h.store.consume(browser, p.nonce, tx.state, old.ref);
  vi.useFakeTimers(); try {
    vi.setSystemTime(Date.now() + 240000); const next = await h.store.createContinuation(browser, { ...intent, state: 'replacement' }, active.handle);
    vi.setSystemTime(Date.now() + 60001);
    await expect(h.store.cancelContinuation(browser, old.ref, p.nonce, active.handle)).rejects.toThrow();
    await expect(h.store.cancelContinuation(browser, next.ref, p.nonce, active.handle)).rejects.toThrow();
    expect((await h.store.loadContinuation(browser, next.ref, active.handle)).intent?.state).toBe('replacement');
    await h.store.cancelContinuation(browser, next.ref, active.csrf, active.handle); expect((await h.store.load(active.handle)).identity.githubId).toBe(1001);
  } finally { vi.useRealTimers(); }
});
it('native first setup preserves original client state/S256 through identity, explicit repository consent and connector return', async () => {
  const h = await harness(), verifier = generateRandomCodeVerifier(), challenge = await calculatePKCECodeChallenge(verifier);
  const output = await build({ stdin: { contents: `import worker,{AccountBrowserSessions as Base} from './account/broker';import{compactDecrypt,CompactEncrypt}from'jose';export {AccountGrantObject} from './account/broker';export class AccountBrowserSessions extends Base{constructor(s,e){super(s,e);this.saved=s;}async fetch(r){const b=await r.clone().json();if(b.operation==='__age'){const key=new Uint8Array(32).fill(171);for(const[k,v]of await this.saved.storage.list({prefix:'session:v2:'})){const d=await compactDecrypt(v,key),s=JSON.parse(new TextDecoder().decode(d.plaintext));if(s.status==='active'){s.verifiedAt-=300001;await this.saved.storage.put(k,await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(s))).setProtectedHeader(d.protectedHeader).encrypt(key));}}return Response.json({aged:true});}return super.fetch(r);}}export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/__age')return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch('https://internal.invalid/',{method:'POST',body:JSON.stringify({operation:'__age'})});if(new URL(r.url).pathname==='/__seed'){await e.ACCOUNT_CONNECTOR_KV.put('client:fixture',JSON.stringify({clientId:'fixture',redirectUris:['https://client.example.test/callback'],clientName:'Fixture connector',tokenEndpointAuthMethod:'none',grantTypes:['authorization_code'],responseTypes:['code']}));return Response.json({seeded:true})}return worker.fetch(r,e,c)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const calls: string[] = [];
  let providerPause: { kind: 'identity' | 'repository'; entered: () => void; wait: Promise<void> } | undefined;
  const bindings = { ...Object.fromEntries(Object.entries(h.env).filter(([, v]) => typeof v === 'string')), ACCOUNT_LOGIN_CALLBACK: h.env.ACCOUNT_ISSUER + '/account/callback', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) };
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings, kvNamespaces: ['ACCOUNT_CONNECTOR_KV'], durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true }, ACCOUNT_GRANTS: { className: 'AccountGrantObject', useSQLite: true } }, outboundService: async (request: import('miniflare').Request) => {
    calls.push(request.method + ' ' + request.url);
    if (request.url === 'https://github.com/login/oauth/access_token' && request.method === 'POST') { const identity = (await request.text()).includes(encodeURIComponent('/account/callback')); if (providerPause?.kind === (identity ? 'identity' : 'repository')) { const paused = providerPause; providerPause = undefined; paused.entered(); await paused.wait; } return Response.json(identity ? { access_token: 'INERT_IDENTITY', token_type: 'bearer', scope: 'read:user' } : { access_token: 'INERT_REPO', refresh_token: 'INERT_REFRESH', token_type: 'bearer', scope: 'repo', expires_in: 3600, refresh_token_expires_in: 7200 }); }
    if (request.url === 'https://api.github.com/user' && request.method === 'GET') return Response.json({ id: 1001 }, { headers: { 'x-oauth-scopes': request.headers.get('Authorization')?.includes('IDENTITY') ? 'read:user' : 'repo' } });
    throw new Error('Unlisted synthetic provider destination');
  } });
  const jar = new Map<string, string>();
  const send = async (path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => { const r = await mf.dispatchFetch(h.env.ACCOUNT_ISSUER + path, { ...init, redirect: 'manual', headers: { Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '), Origin: h.env.ACCOUNT_ISSUER, ...init.headers } }); for (const value of r.headers.getSetCookie()) { const [pair] = value.split(';'), i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); } return r; };
  const form = (html: string) => { const values = new URLSearchParams(); for (const [, key, value] of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) values.set(key, value.replace(/&amp;/g, '&')); return values; };
  try {
    await send('/__seed'); const q = new URLSearchParams({ client_id: 'fixture', redirect_uri: intent.redirectUri, response_type: 'code', scope: 'repository:read', resource: h.env.RESOURCE, state: 'exact-client-state', code_challenge: challenge, code_challenge_method: 'S256' });
    const entryResponse = await send('/authorize?' + q); expect(entryResponse.status).toBe(303); expect(entryResponse.headers.get('Location')).toBe('/account/continue');
    expect((await send('/account/continue')).headers.get('Location')).toBe('/account/signin');
    const signin = await send('/account/signin'), loginForm = form(await signin.text()); expect(loginForm.get('continuation')).toMatch(/^[a-f0-9]{64}$/);
    const login = await send('/account/signin', { method: 'POST', body: loginForm.toString() }); expect(login.status).toBe(303); expect(calls).toEqual([]);
    const loginState = new URL(login.headers.get('Location')!).searchParams.get('state');
    const identity = await send('/account/callback?code=identity&state=' + loginState); expect(identity.status).toBe(303); expect(identity.headers.get('Location')).toBe('/account/continue');
    const repository = await send('/account/continue'), repoHtml = await repository.text(); expect(repoHtml).toContain('upstream writes'); expect(repoHtml).toContain('Connect repository access');
    const repo = await send('/account/repositories/connect', { method: 'POST', body: form(repoHtml).toString() }); expect(repo.status).toBe(303);
    const repoState = new URL(repo.headers.get('Location')!).searchParams.get('state'); expect(new URL(repo.headers.get('Location')!).searchParams.get('scope')).toBe('repo offline_access');
    const connected = await send('/oauth/callback?code=repository&state=' + repoState); expect(connected.status).toBe(303); expect(connected.headers.get('Location')).toBe('/account/continue');
    const consent = await send('/account/continue'), consentHtml = await consent.text(); expect(consentHtml).toContain('Fixture connector'); const approval = form(consentHtml); approval.set('decision', 'approve');
    const approved = await send('/authorize', { method: 'POST', body: approval.toString() }); expect(approved.status).toBe(303); const target = new URL(approved.headers.get('Location')!); expect(target.origin + target.pathname).toBe(intent.redirectUri); expect(target.searchParams.get('state')).toBe('exact-client-state');
    const token = await send('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'fixture', redirect_uri: intent.redirectUri, resource: h.env.RESOURCE, code: target.searchParams.get('code')!, code_verifier: verifier }).toString() }); expect(token.status).toBe(200);
    expect((await send('/authorize', { method: 'POST', body: approval.toString() })).status).toBe(403);
    const publicPage = await send('/account/public?next=https://evil.invalid'); expect(await publicPage.text()).toContain('href="https://cartographer.klappy.dev/explore.html"');
    expect(calls).toEqual(['POST https://github.com/login/oauth/access_token', 'GET https://api.github.com/user', 'POST https://github.com/login/oauth/access_token', 'GET https://api.github.com/user']);
    // Native stale-session recovery using a tests-only encrypted timestamp adjustment, not a wall-clock wait.
    await send('/__age'); q.set('state', 'same-principal-reauth'); expect((await send('/authorize?' + q)).status).toBe(303);
    expect((await send('/account/continue')).headers.get('Location')).toBe('/account/signin');
    let reauthForm = form(await (await send('/account/signin')).text()); const oldHandle = jar.get('__Host-account_session');
    // Regression: this is the actual rendered pending-login nonce with a still-valid stale session cookie.
    const wrongNonce = new URLSearchParams(reauthForm); wrongNonce.set('csrf', 'wrong'); expect((await send('/account/continuation/cancel', { method: 'POST', body: wrongNonce.toString() })).status).toBe(503);
    const wrongRef = new URLSearchParams(reauthForm); wrongRef.set('continuation', 'f'.repeat(64)); expect((await send('/account/continuation/cancel', { method: 'POST', body: wrongRef.toString() })).status).toBe(503);
    const correctBrowser = jar.get('__Host-account_browser')!; jar.set('__Host-account_browser', 'b'.repeat(64)); expect((await send('/account/continuation/cancel', { method: 'POST', body: reauthForm.toString() })).status).toBe(503); jar.set('__Host-account_browser', correctBrowser);
    const preStartCancel = await send('/account/continuation/cancel', { method: 'POST', body: reauthForm.toString() }); expect(preStartCancel.status).toBe(303); expect(preStartCancel.headers.get('Location')).toBe('/account/public'); expect(jar.get('__Host-account_session')).toBe(oldHandle);
    expect(await (await send('/account')).text()).toContain('Repository access connected.');
    // Repeat after provider start/consume: cancellation must authorize via the exact retained binding.
    await send('/authorize?' + q); reauthForm = form(await (await send('/account/signin')).text());
    const cancelStart = await send('/account/signin', { method: 'POST', body: reauthForm.toString() });
    let cancelEntered!: () => void, cancelRelease!: () => void; const cancelWaiting = new Promise<void>(resolve => { cancelEntered = resolve; });
    providerPause = { kind: 'identity', entered: cancelEntered, wait: new Promise<void>(resolve => { cancelRelease = resolve; }) };
    const pendingCanceledCallback = send('/account/callback?code=cancel-inflight&state=' + new URL(cancelStart.headers.get('Location')!).searchParams.get('state')); await cancelWaiting;
    const wrongInflight = new URLSearchParams(reauthForm); wrongInflight.set('csrf', 'wrong'); expect((await send('/account/continuation/cancel', { method: 'POST', body: wrongInflight.toString() })).status).toBe(503);
    expect((await send('/account/continuation/cancel', { method: 'POST', body: reauthForm.toString() })).status).toBe(303);
    cancelRelease(); expect((await pendingCanceledCallback).status).toBe(503); expect(jar.get('__Host-account_session')).toBe(oldHandle); expect(await (await send('/account')).text()).toContain('Repository access connected.');
    await send('/authorize?' + q); reauthForm = form(await (await send('/account/signin')).text());
    const reauthStart = await send('/account/signin', { method: 'POST', body: reauthForm.toString() });
    expect((await send('/account/callback?code=reauth&state=' + new URL(reauthStart.headers.get('Location')!).searchParams.get('state'))).status).toBe(303); expect(jar.get('__Host-account_session')).not.toBe(oldHandle);
    const reauthPage = await (await send('/account/continue')).text(); expect(reauthPage).toContain('Approve connection'); expect(reauthPage).not.toContain('Connect repository access');
    const reauthApproval = form(reauthPage); reauthApproval.set('decision', 'approve');
    const reauthorized = await send('/authorize', { method: 'POST', body: reauthApproval.toString() }); expect(reauthorized.status).toBe(303); expect(new URL(reauthorized.headers.get('Location')!).searchParams.get('state')).toBe('same-principal-reauth');
    // Native replacement while identity provider I/O is paused: old callback cannot bind new intent.
    jar.clear(); q.set('state', 'old-identity-intent'); await send('/authorize?' + q);
    const oldLoginForm = form(await (await send('/account/signin')).text());
    const oldLogin = await send('/account/signin', { method: 'POST', body: oldLoginForm.toString() });
    let entered!: () => void, release!: () => void; let waiting = new Promise<void>(resolve => { entered = resolve; });
    providerPause = { kind: 'identity', entered, wait: new Promise<void>(resolve => { release = resolve; }) };
    const pendingIdentity = send('/account/callback?code=paused&state=' + new URL(oldLogin.headers.get('Location')!).searchParams.get('state')); await waiting;
    q.set('state', 'replacement-identity-intent'); await send('/authorize?' + q); const replacementRef = jar.get('__Host-account_continuation');
    release(); expect((await pendingIdentity).status).toBe(503); expect(jar.get('__Host-account_continuation')).toBe(replacementRef);
    expect((await send('/account/continuation/cancel', { method: 'POST', body: oldLoginForm.toString() })).status).toBe(503);
    expect((await send('/account/continue')).headers.get('Location')).toBe('/account/signin');
    const freshLoginForm = form(await (await send('/account/signin')).text());
    const freshLogin = await send('/account/signin', { method: 'POST', body: freshLoginForm.toString() });
    expect((await send('/account/callback?code=identity&state=' + new URL(freshLogin.headers.get('Location')!).searchParams.get('state'))).status).toBe(303);
    // Explicitly disconnect existing repository authority so this flow must seek separate new consent.
    const accountForm = form(await (await send('/account')).text()); expect((await send('/account/disconnect', { method: 'POST', body: accountForm.toString() })).status).toBe(303);
    const awaitingRepo = form(await (await send('/account/continue')).text());
    const repositoryStart = await send('/account/repositories/connect', { method: 'POST', body: awaitingRepo.toString() }); expect(repositoryStart.status).toBe(303);
    waiting = new Promise<void>(resolve => { entered = resolve; }); providerPause = { kind: 'repository', entered, wait: new Promise<void>(resolve => { release = resolve; }) };
    const pendingRepo = send('/oauth/callback?code=paused&state=' + new URL(repositoryStart.headers.get('Location')!).searchParams.get('state')); await waiting;
    q.set('state', 'replacement-repository-intent'); await send('/authorize?' + q); const nextRef = jar.get('__Host-account_continuation');
    release(); expect((await pendingRepo).status).toBe(503); expect(jar.get('__Host-account_continuation')).toBe(nextRef);
    const stillAwaiting = await (await send('/account/continue')).text(); expect(stillAwaiting).toContain('Repository access is not connected.'); expect(stillAwaiting).toContain('Cancel connection');
    const canceled = await send('/account/continuation/cancel', { method: 'POST', body: form(stillAwaiting).toString() }); expect(canceled.status).toBe(303); expect(canceled.headers.get('Location')).toBe('/account/public');
  } finally { await mf.dispose(); }
}, 30000);

it('native durable spend survives injected failure before completion and a full runtime restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'continuation-restart-'));
  const output = await build({ stdin: { contents: `import {AccountBrowserSessions,BrowserSessions} from './account/browser-session';export class FaultBrowser extends AccountBrowserSessions{constructor(s,e){super(s,e);this.saved=s;}async fetch(r){if(new URL(r.url).pathname==='/__fault-after-spend'){const b=await r.json();await new BrowserSessions(this.saved.storage,new Uint8Array(32).fill(171)).spendContinuation(b.handle,b.ref);return Response.json({error:'injected_before_completion'},{status:503});}return super.fetch(r);}}export default{fetch(r,e){return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const start = () => new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', RESOURCE: intent.resource }, durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'FaultBrowser', useSQLite: true } }, durableObjectsPersist: dir, outboundService: () => { throw new Error('No external egress permitted'); } });
  let mf = start(); const call = (body: unknown, path = '/') => mf.dispatchFetch('https://fixture.invalid' + path, { method: 'POST', redirect: 'manual', body: JSON.stringify(body) });
  try {
    const c = await (await call({ operation: 'continuation-create', handle: browser, intent })).json() as { ref: string };
    const p = await (await call({ operation: 'begin', handle: browser, continuationRef: c.ref })).json() as { nonce: string }, tx = transaction();
    await call({ operation: 'start', handle: browser, nonce: p.nonce, transaction: tx, continuationRef: c.ref });
    const proof = await (await call({ operation: 'consume', handle: browser, nonce: p.nonce, state: tx.state, continuationRef: c.ref })).json() as { proof: string };
    const active = await (await call({ operation: 'activate', githubId: 1001, proof: proof.proof })).json() as { handle: string };
    expect((await call({ operation: 'continuation-stage', handle: active.handle, ref: c.ref, next: 'ready_for_connector' })).status).toBe(200);
    const fault = await call({ handle: active.handle, ref: c.ref }, '/__fault-after-spend'); expect(fault.status).toBe(503); expect(await fault.json()).toEqual({ error: 'injected_before_completion' });
    await mf.dispose(); mf = start();
    expect((await call({ operation: 'load', handle: active.handle })).status).toBe(200); // Native persistence itself recovered.
    expect((await call({ operation: 'continuation-load', handle: browser, ref: c.ref, activeHandle: active.handle })).status).toBe(403);
    expect((await call({ handle: active.handle, ref: c.ref }, '/__fault-after-spend')).status).toBe(500); // Test-only uncaught repeat spend; no code redirect.
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
}, 30000);

it('retired leftover continuation cookie does not block rendered sign-in', async () => {
  const output = await build({ stdin: { contents: `export {AccountBrowserSessions} from './account/browser-session';import {createAccountRoutes} from './account/account-routes';const routes=createAccountRoutes();export default{async fetch(r,e){if(new URL(r.url).pathname.startsWith('/account'))return routes(r,{...e,ACCOUNT_ISSUER:'https://fixture.invalid'},async()=>new Response('',{status:403}));return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', RESOURCE: intent.resource }, durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true } } });
  try {
    const call = (body: unknown) => mf.dispatchFetch('https://fixture.invalid/', { method: 'POST', body: JSON.stringify(body) });
    const created = await (await call({ operation: 'continuation-create', handle: browser, intent })).json() as { ref: string };
    expect(created.ref).toMatch(/^[a-f0-9]{64}$/);
    expect((await call({ operation: 'continuation-retire', handle: browser, ref: created.ref })).status).toBe(200);
    const poisoned = await mf.dispatchFetch('https://fixture.invalid/account/signin', { headers: { Cookie: '__Host-account_browser=' + browser + '; __Host-account_continuation=' + created.ref } }), html = await poisoned.text();
    expect(poisoned.status).toBe(200); expect(html).toContain('Sign in with GitHub'); expect(html).not.toContain('name="continuation"');
    expect([...poisoned.headers.getSetCookie()].join('\n')).toMatch(/__Host-account_continuation=;/);
  } finally { await mf.dispose(); }
}, 30000);
