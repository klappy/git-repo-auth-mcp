import { it, expect, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserSessions } from '../../account/browser-session';
import { productionLogin } from '../../account/login';
const startTransaction = async () => (await productionLogin({ clientId: 'fixture', clientSecret: 'INERT_CLIENT', callback: 'https://fixture.invalid/account/callback', fetch }).begin()).transaction;
it('actual local DO atomically establishes numeric identity and token-free sessions, survives restart, and retires replay/inflight/replacement authority', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'account-v2-test-'));
  const output = await build({ stdin: { contents: `export {AccountBrowserSessions} from './account/browser-session';import {createAccountRoutes} from './account/account-routes';const routes=createAccountRoutes();export default {async fetch(r,e){if(new URL(r.url).pathname.startsWith('/account'))return routes(r,{...e,ACCOUNT_ISSUER:'https://fixture.invalid',ACCOUNT_BROWSER_SESSIONS:e.SESSIONS},async()=>new Response('',{status:403}));return e.SESSIONS.get(e.SESSIONS.idFromName('account-authority-v2')).fetch(r)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const start = () => new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified' }, durableObjects: { SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true } }, durableObjectsPersist: dir });
  let mf = start();
  const call = (value: unknown) => mf.dispatchFetch('https://fixture.invalid/', { method: 'POST', body: JSON.stringify(value) });
  const pending = async (browser: string, activeHandle?: string) => {
    const p = await (await call({ operation: 'begin', handle: browser, activeHandle })).json() as { nonce: string }; expect(p.nonce).toBeTruthy(); const transaction = await startTransaction();
    expect((await call({ operation: 'start', handle: browser, nonce: p.nonce, transaction })).status).toBe(200);
    expect((await call({ operation: 'start', handle: browser, nonce: p.nonce, transaction })).status).toBe(403);
    expect((await call({ operation: 'consume', handle: 'f'.repeat(64), nonce: p.nonce, state: transaction.state })).status).toBe(403);
    const consumed = await (await call({ operation: 'consume', handle: browser, nonce: p.nonce, state: transaction.state })).json() as { proof: string; transaction: unknown };
    expect((await call({ operation: 'consume', handle: browser, nonce: p.nonce, state: transaction.state })).status).toBe(403); return consumed;
  };
  const activate = (proof: string, githubId = 1001) => call({ operation: 'activate', githubId, proof });
  const issue = async (browser: string, id = 1001, activeHandle?: string) => (await (await activate((await pending(browser, activeHandle)).proof, id)).json()) as { handle: string; csrf: string };
  try {
    const browser = '1'.repeat(64), p = await pending(browser), parallel = await Promise.all([activate(p.proof), activate(p.proof)]);
    expect(parallel.map(r => r.status).sort()).toEqual([200, 403]);
    const active = await parallel.find(r => r.status === 200)!.json() as { handle: string; csrf: string }; expect(active.handle).toMatch(/^[a-f0-9]{64}$/);
    const loaded = await (await call({ operation: 'load', handle: active.handle })).json() as { identity: { subject: string; githubId: number }; verifiedAt: number; absoluteUntil: number };
    expect(loaded.identity.githubId).toBe(1001); expect(JSON.stringify(loaded)).not.toMatch(/INERT|managed|access_token|refresh_token/);
    const second = await issue('2'.repeat(64)); const secondSession = await (await call({ operation: 'load', handle: second.handle })).json() as typeof loaded; expect(secondSession.identity).toEqual(loaded.identity);
    const unrelated = await issue('3'.repeat(64), 1002);
    await mf.dispose(); mf = start(); expect((await call({ operation: 'load', handle: active.handle })).status).toBe(200);
    const touched = await (await call({ operation: 'touch', handle: active.handle })).json() as typeof loaded; expect(touched.verifiedAt).toBe(loaded.verifiedAt); expect(touched.absoluteUntil).toBe(loaded.absoluteUntil);
    expect((await call({ operation: 'csrf', handle: active.handle, nonce: 'wrong' })).status).toBe(403);
    const renewed = await (await call({ operation: 'csrf', handle: active.handle, nonce: active.csrf })).json() as { csrf: string }; expect((await call({ operation: 'csrf', handle: active.handle, nonce: active.csrf })).status).toBe(403);
    const inflight = await pending(browser, active.handle), anonymousInflight = await pending('4'.repeat(64));
    expect((await call({ operation: 'revoke-all-local-browser-sessions', handle: active.handle, nonce: renewed.csrf })).status).toBe(200);
    expect((await activate(inflight.proof)).status).toBe(403); expect((await activate(anonymousInflight.proof)).status).toBe(403); expect((await call({ operation: 'load', handle: second.handle })).status).toBe(403); expect((await call({ operation: 'load', handle: unrelated.handle })).status).toBe(200);
    // An unrelated account revocation does not reject another identity's earlier anonymous login.
    const otherPending = await pending('5'.repeat(64)); await call({ operation: 'revoke-all-local-browser-sessions', handle: unrelated.handle, nonce: unrelated.csrf }); expect((await activate(otherPending.proof, 1001)).status).toBe(200);
    const old = await issue(browser); const mismatch = await pending(browser, old.handle); expect((await activate(mismatch.proof, 1002)).status).toBe(403);
    const next = await issue(browser, 1001, old.handle); expect((await call({ operation: 'load', handle: old.handle })).status).toBe(403);
    expect((await call({ operation: 'signout', handle: old.handle, nonce: old.csrf })).status).toBe(200); expect((await call({ operation: 'load', handle: next.handle })).status).toBe(403);
    const last = await issue(browser), waiting = await pending(browser, last.handle); await call({ operation: 'signout', handle: last.handle, nonce: last.csrf }); expect((await activate(waiting.proof)).status).toBe(403);
    // Session-derived browser ownership wins over a missing/changed browser cookie.
    const current = await issue('6'.repeat(64));
    for (const suffix of ['', '; __Host-account_browser=' + '9'.repeat(64)]) {
      const page = await mf.dispatchFetch('https://fixture.invalid/account/signin', { headers: { Cookie: '__Host-account_session=' + current.handle + suffix } }); expect(page.status).toBe(200); expect(page.headers.get('Set-Cookie')).toContain('__Host-account_browser=' + '6'.repeat(64));
    }
    await mf.dispose(); const scan = async (path: string): Promise<void> => { for (const e of await readdir(path, { withFileTypes: true })) { const p = join(path, e.name); if (e.isDirectory()) await scan(p); else expect((await readFile(p)).includes(Buffer.from('INERT'))).toBe(false); } }; await scan(dir);
  } finally { await mf.dispose().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
}, 30_000);

class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') this.data.set(key, structuredClone(value)); else for (const [k, v] of Object.entries(key)) this.data.set(k, structuredClone(v)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>; }
  async transaction<T>(fn: (tx: DurableObjectTransaction) => Promise<T>) { const before = new Map(this.data); try { return await fn(this as unknown as DurableObjectTransaction); } catch (e) { this.data = before; throw e; } }
}
it('v2 idle/absolute/freshness boundaries, encrypted verifier and legacy rejection use deterministic clock', async () => {
  vi.useFakeTimers(); const clock = Date.now(), storage = new Storage(), sessions = new BrowserSessions(storage as unknown as DurableObjectStorage, new Uint8Array(32).fill(7)); const browser = 'a'.repeat(64);
  try {
    const p = await sessions.begin(browser), transaction = await startTransaction(); await sessions.start(browser, p.nonce, transaction); expect(JSON.stringify([...storage.data.values()])).not.toContain(transaction.verifier);
    const consumed = await sessions.consume(browser, p.nonce, transaction.state), active = await sessions.activate(1001, consumed.proof); const original = await sessions.load(active.handle);
    vi.setSystemTime(clock + 300001); await expect(sessions.repositoryCallback(active.handle, 'state')).rejects.toThrow(); expect((await sessions.touch(active.handle)).verifiedAt).toBe(original.verifiedAt);
    vi.setSystemTime(clock + 2100001); await expect(sessions.load(active.handle)).rejects.toThrow();
    vi.setSystemTime(clock); const p2 = await sessions.begin(browser), t2 = await startTransaction(); await sessions.start(browser, p2.nonce, t2); const active2 = await sessions.activate(1001, (await sessions.consume(browser, p2.nonce, t2.state)).proof);
    for (let elapsed = 1200000; elapsed < 28800000; elapsed += 1200000) { vi.setSystemTime(clock + elapsed); await sessions.touch(active2.handle); }
    vi.setSystemTime(clock + 28800000); await expect(sessions.load(active2.handle)).rejects.toThrow();
    await storage.put('session:' + 'f'.repeat(64), 'legacy-v1'); await expect(sessions.load('f'.repeat(64))).rejects.toThrow();
  } finally { vi.useRealTimers(); }
});
it('versioned key rotation has bounded overlap and inconsistent identity restore denies', async () => {
  const storage = new Storage(), key = new Uint8Array(32).fill(7), nextKey = new Uint8Array(32).fill(8), old = new BrowserSessions(storage as unknown as DurableObjectStorage, key, 'old');
  const browser = 'c'.repeat(64), p = await old.begin(browser), t = await startTransaction(); await old.start(browser, p.nonce, t); const active = await old.activate(1001, (await old.consume(browser, p.nonce, t.state)).proof);
  await expect(new BrowserSessions(storage as unknown as DurableObjectStorage, nextKey, 'next').load(active.handle)).rejects.toThrow();
  const rotating = new BrowserSessions(storage as unknown as DurableObjectStorage, nextKey, 'next', [{ id: 'old', key, notAfter: Date.now() + 60000 }]);
  expect((await rotating.load(active.handle)).version).toBe(2); await rotating.touch(active.handle);
  const onlyNew = new BrowserSessions(storage as unknown as DurableObjectStorage, nextKey, 'next'); const session = await onlyNew.load(active.handle);
  await storage.delete('identity:v2:subject:' + session.identity.subject); await expect(onlyNew.load(active.handle)).rejects.toThrow();
  expect(() => new BrowserSessions(storage as unknown as DurableObjectStorage, nextKey, 'next', [{ id: 'old', key, notAfter: Date.now() + 28800001 }])).toThrow();
});
it('actual native browser sign-in/callback consumes state and emits only opaque Secure cookies', async () => {
  const output = await build({ stdin: { contents: `export {AccountBrowserSessions} from './account/browser-session';import {createAccountRoutes} from './account/account-routes';const routes=createAccountRoutes();export default{async fetch(r,e){return routes(r,e,async()=>new Response('',{status:403}))}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const calls: string[] = [];
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://fixture.invalid', ACCOUNT_LOGIN_CALLBACK: 'https://fixture.invalid/account/callback', GITHUB_CLIENT_ID: 'synthetic', GITHUB_CLIENT_SECRET: 'INERT_CLIENT' }, durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true } }, outboundService: (request: import('miniflare').Request) => { calls.push(request.url); return request.url.endsWith('/user') ? Response.json({ id: 1001 }, { headers: { 'x-oauth-scopes': 'read:user' } }) : Response.json({ access_token: 'INERT_ACCESS', refresh_token: 'INERT_REFRESH', token_type: 'bearer', scope: 'read:user' }); } });
  try {
    const page = await mf.dispatchFetch('https://fixture.invalid/account/signin'), html = await page.text(), cookie = page.headers.get('set-cookie')!.split(';')[0], csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)![1];
    const denied = await mf.dispatchFetch('https://fixture.invalid/account/signin', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.invalid' }, body: new URLSearchParams({ csrf }).toString() }); expect(denied.status).toBe(503);
    const start = await mf.dispatchFetch('https://fixture.invalid/account/signin', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://fixture.invalid' }, body: new URLSearchParams({ csrf }).toString() }); expect(start.status).toBe(303);
    const target = new URL(start.headers.get('Location')!), cookies = cookie + '; ' + start.headers.get('set-cookie')!.split(';')[0], callback = 'https://fixture.invalid/account/callback?code=fixture&state=' + target.searchParams.get('state');
    const completed = await mf.dispatchFetch(callback, { headers: { Cookie: cookies } }); expect(completed.status).toBe(303); expect(completed.headers.get('Set-Cookie')).toMatch(/__Host-account_session=[a-f0-9]{64}; Secure; HttpOnly; SameSite=Lax; Path=\//); expect(completed.headers.get('Set-Cookie')).not.toMatch(/INERT|code_verifier/); expect(await completed.text()).not.toMatch(/INERT/);
    expect((await mf.dispatchFetch(callback, { headers: { Cookie: cookies } })).status).toBe(503); expect(calls).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user']);
    expect((await mf.dispatchFetch('https://fixture.invalid/account/public')).status).toBe(200);
  } finally { await mf.dispose(); }
});

it('native browser event gate queues signout until an already-linearized internal commit completes', async () => {
  const output = await build({ stdin: { contents: `
    export {AccountBrowserSessions} from './account/browser-session';
    export class CommitSink {
      constructor(state){this.state=state;this.entered=false;this.release=undefined;}
      async fetch(r){const p=new URL(r.url).pathname;
        if(p==='/entered')return Response.json({entered:this.entered});
        if(p==='/release'){this.release?.();return Response.json({released:true});}
        if(p==='/count')return Response.json({count:await this.state.storage.get('commits')??0});
        if(p!=='/internal/grant/commit')return new Response('',{status:403});
        this.entered=true;await new Promise(resolve=>{this.release=resolve});
        await this.state.storage.put('commits',(await this.state.storage.get('commits')??0)+1);
        return Response.json({generation:2});
      }
    }
    export default{async fetch(r,e){const p=new URL(r.url).pathname;
      if(p.startsWith('/sink/'))return e.ACCOUNT_GRANTS.get(e.ACCOUNT_GRANTS.idFromName('fixture')).fetch('https://internal.invalid/'+p.slice(6));
      return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r);
    }}
  `, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified' }, durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true }, ACCOUNT_GRANTS: { className: 'CommitSink', useSQLite: true } } });
  const call = (body: unknown) => mf.dispatchFetch('https://fixture.invalid/', { method: 'POST', body: JSON.stringify(body) });
  try {
    const handle = '7'.repeat(64), p = await (await call({ operation: 'begin', handle })).json() as { nonce: string }, transaction = await startTransaction();
    await call({ operation: 'start', handle, nonce: p.nonce, transaction });
    const proof = await (await call({ operation: 'consume', handle, nonce: p.nonce, state: transaction.state })).json() as { proof: string };
    const active = await (await call({ operation: 'activate', githubId: 1001, proof: proof.proof })).json() as { handle: string; csrf: string };
    const session = await (await call({ operation: 'load', handle: active.handle })).json() as import('../../account/browser-session').BrowserSession;
    // Point the synthetic sink routing at the actual subject while keeping production gate bytes intact.
    const sink = await mf.getDurableObjectNamespace('ACCOUNT_GRANTS');
    const subjectSink = sink.get(sink.idFromName(session.identity.subject));
    const committing = call({ operation: 'commit-repository', handle: active.handle, proof: { handle: active.handle, generation: session.generation, accountEpoch: session.accountEpoch, subject: session.identity.subject, githubId: 1001 }, assertion: 'INERT_ASSERTION', candidateId: crypto.randomUUID() });
    let entered = false;
    for (let n = 0; n < 100 && !entered; n++) { entered = (await (await subjectSink.fetch('https://internal.invalid/entered')).json() as { entered: boolean }).entered; if (!entered) await new Promise(resolve => setTimeout(resolve, 10)); }
    expect(entered).toBe(true);
    let signedOut = false;
    const signout = call({ operation: 'signout', handle: active.handle, nonce: active.csrf }).then(r => { signedOut = true; return r; });
    await new Promise(resolve => setTimeout(resolve, 30)); expect(signedOut).toBe(false);
    await subjectSink.fetch('https://internal.invalid/release');
    expect((await committing).status).toBe(200); expect((await signout).status).toBe(200);
    expect((await (await subjectSink.fetch('https://internal.invalid/count')).json() as { count: number }).count).toBe(1);
    expect((await call({ operation: 'load', handle: active.handle })).status).toBe(403);
  } finally { await mf.dispose(); }
}, 30_000);
