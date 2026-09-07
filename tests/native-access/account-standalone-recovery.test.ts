import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { BrowserSessions, AccountBrowserSessions, type ContinuationIntent } from '../../account/browser-session';
import { createAccountRoutes } from '../../account/account-routes';
import { standalonePage, accountPage } from '../../account/account-ui';
import { CompactEncrypt, compactDecrypt } from 'jose';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { harness } from './worker-harness';
class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') this.data.set(key, structuredClone(value)); else for (const [k, v] of Object.entries(key)) this.data.set(k, structuredClone(v)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>; }
  async transaction<T>(fn: (tx: DurableObjectTransaction) => Promise<T>) { const old = structuredClone(this.data); try { return await fn(this as unknown as DurableObjectTransaction); } catch (error) { this.data = old; throw error; } }
}
const browser = 'a'.repeat(64), stale = 'b'.repeat(64), key = new Uint8Array(32).fill(0xab);
const intent: ContinuationIntent = { clientId: 'fixture', redirectUri: 'https://client.example.test/callback', state: 'original', responseType: 'code', codeChallenge: 'c'.repeat(43), codeChallengeMethod: 'S256', resource: 'https://navigator.example.test/mcp', scope: ['repository:read'] };
const transaction = () => ({ kind: 'identity-bootstrap' as const, state: crypto.randomUUID(), verifier: 'INERT', callback: 'https://account.example.test/account/callback', expiresAt: Date.now() + 300000 });
it('standalone markup has the existing responsive viewport contract', () => { expect(standalonePage(stale)).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">'); });
it('Verify preserves connector context and uses standalone only on the dashboard', () => { expect(accountPage({ subject: 'fixture', continuationRef: stale })).toContain('href="/account/signin">Verify again'); expect(accountPage({ subject: 'fixture' })).toContain('href="/account/signin?restart=standalone">Verify again'); });
function setup() { const storage = new Storage(), store = new BrowserSessions(storage as unknown as DurableObjectStorage, key); return { storage, store }; }
async function issue(store: BrowserSessions, ref?: string, restart = false, active?: string, id = 1001) { const p = await store.begin(browser, active, ref, restart), tx = transaction(); await store.start(browser, p.nonce, tx, ref, restart); return store.activate(id, (await store.consume(browser, p.nonce, tx.state, ref)).proof); }
async function edit(storage: Storage, prefix: string, mutate: (s: any) => void) { const [k, raw] = [...storage.data].find(([k]) => k.startsWith(prefix))!; const d = await compactDecrypt(raw as string, key), s = JSON.parse(new TextDecoder().decode(d.plaintext)); mutate(s); storage.data.set(k, await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(s))).setProtectedHeader(d.protectedHeader).encrypt(key)); }
it('account repository lease blocks every identity entrypoint and cross-purpose writer before mutation', async () => {
  const { storage, store } = setup(), active = await issue(store), lease = await store.prepareAccountRepository(active.handle, active.csrf, stale), snapshot = structuredClone(storage.data);
  for (const mode of ['ordinary', 'standalone', 'connector']) { await expect(store.begin(browser, undefined, mode === 'connector' ? stale : undefined, mode === 'standalone')).rejects.toThrow(); expect(storage.data).toEqual(snapshot); }
  await expect(store.repositoryCallback(active.handle, 'connector-state')).rejects.toThrow(); expect(storage.data).toEqual(snapshot);
  await expect(store.prepareAccountRepository(active.handle, (await store.load(active.handle)).csrf)).rejects.toThrow(); expect(storage.data).toEqual(snapshot);
  await store.cancelAccountRepository(active.handle, lease.lease, (await store.load(active.handle)).csrf); const next = await store.prepareAccountRepository(active.handle, (await store.load(active.handle)).csrf); expect(next.lease).not.toBe(lease.lease);
});
it('identity activation begun before either repository purpose cannot rotate away the later operation', async () => {
  for (const purpose of ['account', 'connector']) {
    const { storage, store } = setup(), active = await issue(store), ref = purpose === 'connector' ? (await store.createContinuation(browser, intent, active.handle)).ref : undefined;
    const p = await store.begin(browser, active.handle, ref), tx = transaction(); await store.start(browser, p.nonce, tx, ref); const proof = await store.consume(browser, p.nonce, tx.state, ref);
    if (purpose === 'account') await store.prepareAccountRepository(active.handle, active.csrf); else await store.repositoryCallback(active.handle, 'connector-state', false, ref);
    const before = structuredClone(storage.data); await expect(store.activate(1001, proof.proof)).rejects.toThrow(); before.delete([...before.keys()].find(k => k.startsWith('activation:'))!); expect(storage.data).toEqual(before);
    if (purpose === 'connector') { await expect(store.prepareAccountRepository(active.handle, active.csrf, ref)).rejects.toThrow(); expect(storage.data).toEqual(before); }
  }
});
it('captured repository lease rejects replacement and ABA at attach and final commit', async () => {
  for (const phase of ['attach', 'commit']) for (const retire of [false, true]) {
    const { storage, store } = setup(), active = await issue(store), { lease } = await store.prepareAccountRepository(active.handle, active.csrf);
    if (phase === 'commit') { await store.attachAccountRepository(active.handle, lease, 'state'); expect((await store.repositoryCallback(active.handle, 'state', true, stale)).purpose).toBe('account'); }
    const c = await store.createContinuation(browser, intent, active.handle); if (retire) await store.retireContinuation(browser, c.ref); const before = structuredClone(storage.data);
    if (phase === 'attach') await expect(store.attachAccountRepository(active.handle, lease, 'state')).rejects.toThrow(); else await expect(store.commitAccountRepository(active.handle, lease, 'candidate')).rejects.toThrow(); expect(storage.data).toEqual(before);
  }
});
it('repository committing binds one candidate and is not cancelable or overwritten', async () => {
  const { storage, store } = setup(), active = await issue(store), { lease } = await store.prepareAccountRepository(active.handle, active.csrf);
  await store.attachAccountRepository(active.handle, lease, 'state'); await store.repositoryCallback(active.handle, 'state', true, stale); await store.commitAccountRepository(active.handle, lease, 'exact-candidate'); const before = structuredClone(storage.data);
  await expect(store.cancelAccountRepository(active.handle, lease, (await store.load(active.handle)).csrf)).rejects.toThrow(); await expect(store.commitAccountRepository(active.handle, lease, 'substitute', true)).rejects.toThrow(); await expect(store.commitAccountRepository(active.handle, lease, 'exact-candidate')).rejects.toThrow(); await expect(store.repositoryCallback(active.handle, 'other-state')).rejects.toThrow(); expect(storage.data).toEqual(before);
  expect(JSON.stringify([...storage.data.values()])).not.toContain('exact-candidate'); await store.commitAccountRepository(active.handle, lease, 'exact-candidate', true); expect((await store.load(active.handle)).repositoryState).toBeUndefined();
});
it('exact repository cancel during exchange invalidates final commit without disconnecting session', async () => {
  const { storage, store } = setup(), active = await issue(store), { lease } = await store.prepareAccountRepository(active.handle, active.csrf); await store.attachAccountRepository(active.handle, lease, 'state');
  await store.repositoryCallback(active.handle, 'state', true, stale); const before = structuredClone(storage.data);
  await expect(store.cancelAccountRepository(active.handle, 'wrong', (await store.load(active.handle)).csrf)).rejects.toThrow(); await expect(store.cancelAccountRepository(active.handle, lease, 'wrong')).rejects.toThrow(); expect(storage.data).toEqual(before);
  await store.cancelAccountRepository(active.handle, lease, (await store.load(active.handle)).csrf); await expect(store.commitAccountRepository(active.handle, lease, 'candidate')).rejects.toThrow(); expect((await store.load(active.handle)).identity.githubId).toBe(1001);
});
it('authorized connector Cancel releases only its matching repository operation so identity can resume', async () => {
  const { store } = setup(), active = await issue(store), c = await store.createContinuation(browser, intent, active.handle); await store.repositoryCallback(active.handle, 'state', false, c.ref);
  await store.cancelContinuation(browser, c.ref, active.csrf, active.handle); expect((await store.load(active.handle)).repositoryState).toBeUndefined(); expect((await store.begin(browser, active.handle)).nonce).toBeTruthy();
});
it('competing connector POST denies before CSRF mutation or broker dispatch for either repository purpose', async () => {
  for (const purpose of ['account', 'connector']) {
    const { storage, store } = setup(), active = await issue(store);
    if (purpose === 'account') await store.prepareAccountRepository(active.handle, active.csrf);
    const c = await store.createContinuation(browser, intent, active.handle);
    if (purpose === 'connector') await store.prepareConnectorRepository(active.handle, active.csrf, c.ref);
    const session = await store.load(active.handle), env = { PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://account.example.test', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) }, object = new AccountBrowserSessions({ storage } as unknown as DurableObjectState, env);
    const bound = { ...env, ACCOUNT_BROWSER_SESSIONS: { idFromName: (s: string) => s, get: () => ({ fetch: (u: string, init: RequestInit) => object.fetch(new Request(u, init)) }) } };
    const broker = vi.fn(async () => { throw new Error('Must not dispatch'); }), before = structuredClone(storage.data);
    const response = await createAccountRoutes()(new Request(env.ACCOUNT_ISSUER + '/account/repositories/connect', { method: 'POST', headers: { Origin: env.ACCOUNT_ISSUER, Cookie: '__Host-account_session=' + active.handle + '; __Host-account_browser=' + browser + '; __Host-account_continuation=' + c.ref }, body: new URLSearchParams({ csrf: session.csrf, continuation: c.ref }).toString() }), bound as never, broker);
    expect(response?.status).toBe(503); expect(storage.data).toEqual(before); expect(broker).not.toHaveBeenCalled();
  }
});
it('standalone is explicit, terminal-only and preserves state on storage failure or a different live slot', async () => {
  const { storage, store } = setup(), old = await store.createContinuation(browser, intent), next = await store.createContinuation(browser, { ...intent, state: 'next' });
  const live = await store.begin(browser, undefined, next.ref), before = structuredClone(storage.data);
  await expect(store.begin(browser, undefined, old.ref, true)).rejects.toThrow(); expect(storage.data).toEqual(before);
  await expect(store.begin(browser, undefined, next.ref, true)).rejects.toThrow(); expect(storage.data).toEqual(before);
  await store.retireContinuation(browser, next.ref); await expect(store.begin(browser, undefined, next.ref)).rejects.toThrow();
  const p = await store.begin(browser, undefined, next.ref, true); expect(p.nonce).not.toBe(live.nonce);
  const c = await store.createContinuation(browser, intent); storage.data.set([...storage.data.keys()].find(k => k.startsWith('continuation:'))!, 'corrupt');
  const corrupt = structuredClone(storage.data); await expect(store.begin(browser, undefined, c.ref, true)).rejects.toThrow(); expect(storage.data).toEqual(corrupt);
});
it('slot revision rejects replacement and absence ABA before start and after consume without mutating replacement', async () => {
  for (const afterConsume of [false, true]) for (const retire of [false, true]) {
    const { storage, store } = setup(), p = await store.begin(browser, undefined, stale, true), tx = transaction();
    let proof: string | undefined; if (afterConsume) { await store.start(browser, p.nonce, tx, stale, true); proof = (await store.consume(browser, p.nonce, tx.state, stale)).proof; }
    const next = await store.createContinuation(browser, intent); if (retire) await store.retireContinuation(browser, next.ref);
    const snapshot = structuredClone(storage.data);
    if (proof) { await expect(store.activate(1001, proof)).rejects.toThrow(); snapshot.delete([...snapshot.keys()].find(k => k.startsWith('activation:'))!); }
    else await expect(store.start(browser, p.nonce, tx, stale, true)).rejects.toThrow();
    expect(storage.data).toEqual(snapshot);
    await expect(store.cancelRestart(browser, p.nonce, stale)).rejects.toThrow(); expect(storage.data).toEqual(snapshot);
  }
});
it('revision defaults only when absent, never resets, and malformed or exhausted counters deny atomically', async () => {
  const { storage, store } = setup(); await store.begin(browser, undefined, stale, true);
  const ledgerKey = [...storage.data.keys()].find(k => k.startsWith('browser:'))!;
  for (const revision of [null, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) { const ledger = storage.data.get(ledgerKey) as any; delete ledger.slotRevision; ledger.slotRevision = revision; const before = structuredClone(storage.data); await expect(store.begin(browser, undefined, stale, true)).rejects.toThrow(); expect(storage.data).toEqual(before); }
  (storage.data.get(ledgerKey) as any).slotRevision = Number.MAX_SAFE_INTEGER; const before = structuredClone(storage.data); await expect(store.createContinuation(browser, intent)).rejects.toThrow(); expect(storage.data).toEqual(before);
  delete (storage.data.get(ledgerKey) as any).slotRevision; const c = await store.createContinuation(browser, intent); await store.retireContinuation(browser, c.ref); expect((storage.data.get(ledgerKey) as any).slotRevision).toBe(2);
});
it('persisted null, empty or nonstring continuation data is never true absence in either sign-in mode', async () => {
  for (const value of [null, '', 0, false, {}, 'not-an-envelope']) for (const restart of [false, true]) {
    const { storage, store } = setup(); await store.createContinuation(browser, intent); const slot = [...storage.data.keys()].find(k => k.startsWith('continuation:'))!; storage.data.set(slot, value);
    const before = structuredClone(storage.data); await expect(store.begin(browser, undefined, restart ? stale : undefined, restart)).rejects.toThrow(); expect(storage.data).toEqual(before);
  }
});
it('persisted malformed session bytes deny restart instead of becoming an absent identity', async () => {
  for (const value of [null, '', 0, false, {}, 'corrupt']) { const { storage, store } = setup(), active = await issue(store); const session = [...storage.data.keys()].find(k => k.startsWith('session:'))!; storage.data.set(session, value); const before = structuredClone(storage.data); await expect(store.begin(browser, active.handle, stale, true)).rejects.toThrow(); expect(storage.data).toEqual(before); }
});
it('trusted terminal identity survives expired session; mismatch and revoked or malformed binding deny', async () => {
  for (const noCookie of [false, true]) for (const fault of ['wrong-id', 'revoked', 'missing-epoch', 'none']) {
    const { storage, store } = setup(), active = await issue(store), c = await store.createContinuation(browser, intent, active.handle);
    await edit(storage, 'continuation:', s => { s.expiresAt = Date.now() - 1; if (fault === 'missing-epoch') delete s.expectedEpoch; });
    await edit(storage, 'session:', s => { s.idleUntil = Date.now() - 1; });
    if (fault === 'revoked') { const subject = [...storage.data.keys()].find(k => k.startsWith('identity:'));
      const d = await compactDecrypt([...storage.data].find(([k]) => k.startsWith('continuation:'))![1] as string, key), c = JSON.parse(new TextDecoder().decode(d.plaintext)); storage.data.set('epoch:v2:' + c.expected.subject, { generation: 1, revokedAtSequence: 1 }); }
    const ref = noCookie ? undefined : c.ref;
    if (fault === 'revoked' || fault === 'missing-epoch') await expect(store.begin(browser, active.handle, ref, true)).rejects.toThrow();
    else if (fault === 'wrong-id') await expect(issue(store, ref, true, active.handle, 2002)).rejects.toThrow();
    else { const recovered = await issue(store, ref, true, active.handle); expect((await store.load(recovered.handle)).identity.githubId).toBe(1001); await expect(store.loadContinuation(browser, c.ref)).rejects.toThrow(); }
  }
});
it('server-selected terminal hashes are validated and supplied wrong ref never falls back', async () => {
  for (const badHash of ['', 'x'.repeat(64), 'A'.repeat(64), 123, null]) {
    const { storage, store } = setup(); await store.createContinuation(browser, intent); await edit(storage, 'continuation:', c => { c.expiresAt = Date.now() - 1; c.refHash = badHash; });
    const before = structuredClone(storage.data); await expect(store.begin(browser, undefined, undefined, true)).rejects.toThrow(); expect(storage.data).toEqual(before);
  }
  const { storage, store } = setup(); const c = await store.createContinuation(browser, intent); await edit(storage, 'continuation:', c => { c.expiresAt = Date.now() - 1; });
  await expect(store.begin(browser, undefined, stale, true)).rejects.toThrow(); await expect(store.begin(browser)).rejects.toThrow();
  const p = await store.begin(browser, undefined, undefined, true), tx = transaction(); await expect(store.start(browser, p.nonce, tx, c.ref, true)).rejects.toThrow(); await expect(store.cancelRestart(browser, p.nonce, c.ref)).rejects.toThrow();
  await store.start(browser, p.nonce, tx, undefined, true); await store.cancelRestart(browser, p.nonce); await expect(store.consume(browser, p.nonce, tx.state)).rejects.toThrow();
});
it('exact Cancel invalidates consumed proof, preserves active session, and mode omission cannot downgrade', async () => {
  for (const consumed of [false, true]) {
    const { storage, store } = setup(), active = await issue(store), p = await store.begin(browser, active.handle, stale, true), tx = transaction();
    await expect(store.start(browser, p.nonce, tx, stale)).rejects.toThrow(); await store.start(browser, p.nonce, tx, stale, true);
    const proof = consumed ? (await store.consume(browser, p.nonce, tx.state, 'f'.repeat(64))).proof : undefined;
    const before = structuredClone(storage.data); await expect(store.cancelRestart(browser, p.nonce, 'f'.repeat(64))).rejects.toThrow(); expect(storage.data).toEqual(before);
    await store.cancelRestart(browser, p.nonce, stale); if (proof) await expect(store.activate(1001, proof)).rejects.toThrow(); else await expect(store.consume(browser, p.nonce, tx.state, stale)).rejects.toThrow();
    expect((await store.load(active.handle)).identity.githubId).toBe(1001);
  }
});

it('real routes deny transient storage failure and a delayed old success never clears the newer continuation cookie', async () => {
  const { storage, store } = setup();
  const env = { PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://account.example.test', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) };
  const object = new AccountBrowserSessions({ storage } as unknown as DurableObjectState, env);
  let pause = false, entered!: () => void, release!: () => void; const waiting = new Promise<void>(r => { entered = r; }), released = new Promise<void>(r => { release = r; });
  const routedEnv = { ...env, ACCOUNT_BROWSER_SESSIONS: { idFromName: (s: string) => s, get: () => ({ fetch: async (url: string, init: RequestInit) => { const r = await object.fetch(new Request(url, init)); if (pause) { entered(); await released; } return r; } }) } };
  const request = () => new Request(env.ACCOUNT_ISSUER + '/account/signin?restart=standalone', { headers: { Cookie: '__Host-account_browser=' + browser + '; __Host-account_continuation=' + stale } });
  const route = createAccountRoutes(), broker = async () => { throw new Error('No broker call expected'); };
  const get = storage.get.bind(storage), fault = vi.spyOn(storage, 'get').mockImplementation(async k => { if (k.startsWith('continuation:')) throw new Error('injected storage unavailable'); return get(k); });
  const before = structuredClone(storage.data); const denied = await route(request(), routedEnv as never, broker); expect(denied?.status).toBe(503); expect(storage.data).toEqual(before); expect(denied?.headers.get('Set-Cookie')).toBeNull(); fault.mockRestore();
  pause = true; const delayed = route(request(), routedEnv as never, broker); await waiting;
  const next = await store.createContinuation(browser, intent); await store.begin(browser, undefined, next.ref); const replacement = structuredClone(storage.data); release();
  const response = await delayed; expect(response?.status).toBe(200); expect(response?.headers.get('Set-Cookie')).not.toContain('__Host-account_continuation'); expect(storage.data).toEqual(replacement);
});

it('native rendered standalone login covers missing, retired, expired and spent refs, and Cancel during provider exchange', async () => {
  const h = await harness();
  const output = await build({ stdin: { contents: `import worker,{AccountBrowserSessions as Base} from './account/broker';import{BrowserSessions}from'./account/browser-session';import{compactDecrypt,CompactEncrypt}from'jose';export class AccountBrowserSessions extends Base{constructor(s,e){super(s,e);this.saved=s;}async fetch(r){const b=await r.clone().json();if(b.operation==='__slot'){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.handle))),n=>n.toString(16).padStart(2,'0')).join('');await this.saved.storage.put('continuation:v2:'+hash,b.value);return Response.json({ok:true})}if(b.operation==='__snapshot')return Response.json(Array.from(await this.saved.storage.list()).filter(([k])=>!k.startsWith('activation:')));if(b.operation==='__spend')return Response.json(await new BrowserSessions(this.saved.storage,new Uint8Array(32).fill(171)).spendContinuation(b.handle,b.ref));if(b.operation==='__expire'){for(const[k,v]of await this.saved.storage.list({prefix:'continuation:v2:'})){const d=await compactDecrypt(v,new Uint8Array(32).fill(171)),s=JSON.parse(new TextDecoder().decode(d.plaintext));s.expiresAt=Date.now()-1;await this.saved.storage.put(k,await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(s))).setProtectedHeader(d.protectedHeader).encrypt(new Uint8Array(32).fill(171)));}return Response.json({ok:true})}return super.fetch(r)}}export default{fetch(r,e,c){if(new URL(r.url).pathname==='/__op')return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r);return worker.fetch(r,e,c)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  let entered!: () => void, release!: () => void, pause: Promise<void> | undefined, providerId = 1001;
  const calls: string[] = [], bindings = { ...Object.fromEntries(Object.entries(h.env).filter(([, v]) => typeof v === 'string')), ACCOUNT_LOGIN_CALLBACK: h.env.ACCOUNT_ISSUER + '/account/callback', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) };
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings, durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true } }, outboundService: async (request: import('miniflare').Request) => {
    calls.push(request.method + ' ' + request.url); if (request.method === 'POST' && request.url === 'https://github.com/login/oauth/access_token') { if (pause) { entered(); await pause; pause = undefined; } return Response.json({ access_token: 'INERT_IDENTITY', token_type: 'bearer', scope: 'read:user' }); } if (request.method === 'GET' && request.url === 'https://api.github.com/user') return Response.json({ id: providerId }, { headers: { 'x-oauth-scopes': 'read:user' } }); throw new Error('Unlisted synthetic destination');
  } });
  const jar = new Map<string, string>();
  const send = async (path: string, method = 'GET', body?: string) => { const r = await mf.dispatchFetch(h.env.ACCOUNT_ISSUER + path, { method, body, redirect: 'manual', headers: { Origin: h.env.ACCOUNT_ISSUER, Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') } }); for (const value of r.headers.getSetCookie()) { expect(value).not.toMatch(/^__Host-account_continuation=;/); const [pair] = value.split(';'), i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); } return r; };
  const op = async (value: Record<string, unknown>) => { const r = await send('/__op', 'POST', JSON.stringify(value)); expect(r.status).toBe(200); return r.json() as Promise<any>; };
  const fields = (html: string) => { const form = new URLSearchParams(); for (const [, k, v] of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) form.set(k, v); return form; };
  try {
    for (const noCookie of [false, true]) for (const kind of ['missing', 'retired', 'expired', 'spent', 'cancel-before', 'cancel-consumed', 'replace-before', 'aba-before', 'replace-inflight', 'aba-inflight', 'ordinary-inflight', 'ordinary-late', 'identity-mismatch']) {
      providerId = kind === 'identity-mismatch' ? 2002 : 1001;
      jar.clear(); const handle = crypto.randomUUID().replaceAll('-', '').repeat(2); jar.set('__Host-account_browser', handle);
      const p = await op({ operation: 'begin', handle }), tx = transaction(); await op({ operation: 'start', handle, nonce: p.nonce, transaction: tx }); const proof = await op({ operation: 'consume', handle, nonce: p.nonce, state: tx.state }); const active = await op({ operation: 'activate', githubId: 1001, proof: proof.proof }); jar.set('__Host-account_session', active.handle);
      let ref = stale; if (kind === 'retired' || kind === 'expired' || kind === 'spent') { const c = await op({ operation: 'continuation-create', handle, activeHandle: active.handle, intent: { ...intent, resource: h.env.RESOURCE } }); ref = c.ref; if (kind === 'retired') await op({ operation: 'continuation-retire', handle, ref }); else if (kind === 'expired') await op({ operation: '__expire' }); else { await op({ operation: 'continuation-stage', handle: active.handle, ref, next: 'ready_for_connector' });
        // Exercise the actual durable spend through a tests-only direct binding helper below.
        const namespace = await mf.getDurableObjectNamespace('ACCOUNT_BROWSER_SESSIONS'); const stub = namespace.get(namespace.idFromName('account-authority-v2')); const result = await stub.fetch('https://internal.invalid', { method: 'POST', body: JSON.stringify({ operation: '__spend', handle: active.handle, ref }) }); expect(result.status).toBe(200);
      } }
      if ((noCookie || kind === 'identity-mismatch') && !['missing', 'retired', 'expired', 'spent', 'ordinary-inflight', 'ordinary-late'].includes(kind)) { const c = await op({ operation: 'continuation-create', handle, activeHandle: active.handle, intent: { ...intent, resource: h.env.RESOURCE } }); ref = c.ref; await op({ operation: '__expire' }); }
      if (kind === 'ordinary-late') {
        const c = await op({ operation: 'continuation-create', handle, activeHandle: active.handle, intent: { ...intent, resource: h.env.RESOURCE } }); await op({ operation: 'begin', handle, activeHandle: active.handle, continuationRef: c.ref });
        const snapshot = await op({ operation: '__snapshot' }); expect((await send('/account/signin')).status).toBe(503); expect(await op({ operation: '__snapshot' })).toEqual(snapshot); continue;
      }
      if (kind !== 'ordinary-inflight' && !noCookie) jar.set('__Host-account_continuation', ref);
      if (noCookie && ['expired', 'spent', 'identity-mismatch'].includes(kind)) jar.delete('__Host-account_session');
      const page = await send(kind === 'ordinary-inflight' ? '/account/signin' : '/account/signin?restart=standalone'); expect(page.status).toBe(200); const form = fields(await page.text()); if (kind !== 'ordinary-inflight') { expect(form.get('restart')).toBe('standalone'); expect(form.get('continuation')).toBe(noCookie ? '' : ref); }
      if (kind.endsWith('-before') && kind !== 'cancel-before') {
        const c = await op({ operation: 'continuation-create', handle, activeHandle: active.handle, intent: { ...intent, resource: h.env.RESOURCE } });
        if (kind.startsWith('aba')) await op({ operation: 'continuation-retire', handle, ref: c.ref }); else await op({ operation: 'begin', handle, activeHandle: active.handle, continuationRef: c.ref });
        const snapshot = await op({ operation: '__snapshot' }); expect((await send('/account/signin', 'POST', form.toString())).status).toBe(503); expect(await op({ operation: '__snapshot' })).toEqual(snapshot); continue;
      }
      const wrong = new URLSearchParams(form); wrong.set('continuation', 'f'.repeat(64)); expect((await send('/account/signin/restart/cancel', 'POST', wrong.toString())).status).toBe(503);
      if (kind === 'cancel-before') { expect((await send('/account/signin/restart/cancel', 'POST', form.toString())).status).toBe(303); expect((await send('/account/signin', 'POST', form.toString())).status).toBe(503); continue; }
      const start = await send('/account/signin', 'POST', form.toString()); expect(start.status).toBe(303); const state = new URL(start.headers.get('Location')!).searchParams.get('state');
      let waiting: Promise<void> | undefined; if (kind === 'cancel-consumed' || kind.endsWith('inflight')) { waiting = new Promise<void>(r => { entered = r; }); pause = new Promise<void>(r => { release = r; }); }
      const callback = send('/account/callback?code=fixture&state=' + state);
      if (waiting) { await waiting;
        if (kind === 'cancel-consumed') expect((await send('/account/signin/restart/cancel', 'POST', form.toString())).status).toBe(303);
        else { const c = await op({ operation: 'continuation-create', handle, activeHandle: active.handle, intent: { ...intent, resource: h.env.RESOURCE } }); jar.set('__Host-account_continuation', c.ref); if (kind.startsWith('aba')) await op({ operation: 'continuation-retire', handle, ref: c.ref }); else await op({ operation: 'begin', handle, activeHandle: active.handle, continuationRef: c.ref }); }
        const snapshot = await op({ operation: '__snapshot' }); release(); expect((await callback).status).toBe(503); expect(jar.get('__Host-account_session')).toBe(active.handle); expect(await op({ operation: '__snapshot' })).toEqual(snapshot);
      }
      else { const result = await callback; if (kind === 'identity-mismatch') { expect(result.status).toBe(503); expect((await op({ operation: 'load', handle: active.handle })).identity.githubId).toBe(1001); } else { expect(result.status).toBe(303); expect(result.headers.get('Location')).toBe('/account'); expect(jar.get('__Host-account_continuation')).toBe(noCookie ? undefined : ref); } }
    }
    for (const value of [null, '', 0]) {
      jar.clear(); const handle = crypto.randomUUID().replaceAll('-', '').repeat(2); jar.set('__Host-account_browser', handle);
      const c = await op({ operation: 'continuation-create', handle, intent: { ...intent, resource: h.env.RESOURCE } }); await op({ operation: '__slot', handle, value }); const snapshot = await op({ operation: '__snapshot' });
      expect((await send('/account/signin')).status).toBe(503); jar.set('__Host-account_continuation', c.ref); expect((await send('/account/signin?restart=standalone')).status).toBe(503); expect(await op({ operation: '__snapshot' })).toEqual(snapshot);
    }
    expect(calls.every(c => c === 'POST https://github.com/login/oauth/access_token' || c === 'GET https://api.github.com/user')).toBe(true);
  } finally { release?.(); await mf.dispose(); }
}, 30000);
