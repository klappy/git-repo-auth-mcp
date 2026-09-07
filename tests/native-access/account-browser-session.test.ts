import { it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const managed = { access_token: 'INERT_MANAGED_ACCESS', refresh_token: 'INERT_MANAGED_REFRESH', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'managed-A' }, provider_token: 'INERT_PROVIDER_ACCESS', provider_refresh_token: 'INERT_PROVIDER_REFRESH', user_metadata: { unsafe: 'INERT_PRIVATE_METADATA' } };
it('actual local DO restart preserves encrypted sessions, one-use CSRF and immutable bidirectional identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'account-browser-test-'));
  const output = await build({ stdin: { contents: `export {AccountBrowserSessions} from './account/browser-session';export {AccountIdentityRegistry} from './account/identity-registry';import {createAccountRoutes} from './account/account-routes';const routes=createAccountRoutes({begin:async()=>{throw Error()},complete:async()=>{throw Error()},revalidate:async()=>{throw Error()},signout:async()=>{}});export default {async fetch(r,e){if(new URL(r.url).pathname.startsWith('/account'))return routes(r,{...e,ACCOUNT_ISSUER:'https://fixture.invalid',ACCOUNT_BROWSER_SESSIONS:e.SESSIONS},async()=>new Response('',{status:403}));const isIdentity=new URL(r.url).pathname==='/identity';const binding=isIdentity?e.IDENTITIES:e.SESSIONS;return binding.get(binding.idFromName(isIdentity?'identity-registry-v1':'browser-sessions-v1')).fetch(r)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const start = () => new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) }, durableObjects: { SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true }, IDENTITIES: { className: 'AccountIdentityRegistry', useSQLite: true } }, durableObjectsPersist: dir });
  let mf = start();
  const call = (path: string, value: unknown) => mf.dispatchFetch('https://fixture.invalid' + path, { method: 'POST', body: JSON.stringify(value) });
  try {
    const identity = { subject: 'managed-A', githubId: 1001 };
    expect((await call('/identity', { operation: 'bind', identity })).status).toBe(200);
    const races = await Promise.all([{ subject: 'managed-A', githubId: 1002 }, { subject: 'managed-B', githubId: 1001 }].map(identity => call('/identity', { operation: 'bind', identity })));
    expect(races.map(r => r.status)).toEqual([403, 403]);
    const browser = '1'.repeat(64), begin = await (await call('/', { operation: 'begin', handle: browser })).json() as { nonce: string };
    expect((await call('/', { operation: 'start', handle: browser, nonce: begin.nonce })).status).toBe(200);
    expect((await call('/', { operation: 'start', handle: browser, nonce: begin.nonce })).status).toBe(403);
    expect((await call('/', { operation: 'consume', handle: '2'.repeat(64), nonce: begin.nonce })).status).toBe(403);
    const consumed = await (await call('/', { operation: 'consume', handle: browser, nonce: begin.nonce })).json() as { proof: string };
    expect((await call('/', { operation: 'consume', handle: browser, nonce: begin.nonce })).status).toBe(403);
    const active = await (await call('/', { operation: 'activate', identity, managed, proof: consumed.proof })).json() as { handle: string; csrf: string };
    expect(active.handle).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(active)).not.toContain('INERT_');
    await mf.dispose(); mf = start();
    expect((await call('/identity', { operation: 'verify', identity })).status).toBe(200);
    const loaded = await call('/', { operation: 'load', handle: active.handle }); expect(loaded.status).toBe(200); expect(await loaded.text()).not.toMatch(/INERT_PROVIDER|INERT_PRIVATE/);
    expect((await call('/', { operation: 'csrf', handle: '3'.repeat(64), nonce: active.csrf })).status).toBe(403);
    expect((await call('/', { operation: 'csrf', handle: active.handle, nonce: active.csrf })).status).toBe(200);
    expect((await call('/', { operation: 'csrf', handle: active.handle, nonce: active.csrf })).status).toBe(403);
    const pending = await (await call('/', { operation: 'begin', handle: browser })).json() as { nonce: string };
    await call('/', { operation: 'start', handle: browser, nonce: pending.nonce });
    const inFlight = await (await call('/', { operation: 'consume', handle: browser, nonce: pending.nonce })).json() as { proof: string };
    await call('/', { operation: 'invalidate', handle: active.handle });
    expect((await call('/', { operation: 'activate', identity, managed, proof: inFlight.proof })).status).toBe(403);
    expect((await call('/', { operation: 'consume', handle: browser, nonce: pending.nonce })).status).toBe(403);
    await mf.dispose(); mf = start(); expect((await call('/', { operation: 'load', handle: active.handle })).status).toBe(403);
    const issue = async () => {
      const p = await (await call('/', { operation: 'begin', handle: browser })).json() as { nonce: string };
      await call('/', { operation: 'start', handle: browser, nonce: p.nonce });
      const proof = await (await call('/', { operation: 'consume', handle: browser, nonce: p.nonce })).json() as { proof: string };
      return await (await call('/', { operation: 'activate', identity, managed, proof: proof.proof })).json() as { handle: string; csrf: string };
    };
    const old = await issue(); const before = await (await call('/', { operation: 'load', handle: old.handle })).json() as { idleUntil: number; absoluteUntil: number };
    await new Promise(r => setTimeout(r, 10)); const touched = await (await call('/', { operation: 'touch', handle: old.handle })).json() as { idleUntil: number; absoluteUntil: number };
    expect(touched.idleUntil).toBeGreaterThanOrEqual(before.idleUntil); expect(touched.absoluteUntil).toBe(before.absoluteUntil); expect(touched.idleUntil).toBeLessThanOrEqual(touched.absoluteUntil);
    // Callback activation wins after signout loaded old state but before its atomic retirement.
    const replacement = await issue(); expect((await call('/', { operation: 'load', handle: old.handle })).status).toBe(403);
    expect((await call('/', { operation: 'signout', handle: old.handle, nonce: old.csrf })).status).toBe(200);
    expect((await call('/', { operation: 'load', handle: replacement.handle })).status).toBe(403);
    expect((await call('/', { operation: 'signout', handle: old.handle, nonce: old.csrf })).status).toBe(403);
    const last = await issue(), waiting = await (await call('/', { operation: 'begin', handle: browser })).json() as { nonce: string };
    await call('/', { operation: 'start', handle: browser, nonce: waiting.nonce });
    await call('/', { operation: 'signout', handle: last.handle, nonce: last.csrf });
    expect((await call('/', { operation: 'consume', handle: browser, nonce: waiting.nonce })).status).toBe(403);

    for (const browserCookie of ['', '; __Host-account_browser=' + '9'.repeat(64)]) {
      const current = await issue();
      const page = await mf.dispatchFetch('https://fixture.invalid/account/signin', { headers: { Cookie: '__Host-account_session=' + current.handle + browserCookie } });
      expect(page.status).toBe(200); expect(page.headers.get('Set-Cookie')).toContain('__Host-account_browser=' + browser);
      const nonce = (await page.text()).match(/name="csrf" value="([a-f0-9]+)"/)![1];
      await call('/', { operation: 'start', handle: browser, nonce });
      await call('/', { operation: 'signout', handle: current.handle, nonce: current.csrf });
      expect((await call('/', { operation: 'consume', handle: browser, nonce })).status).toBe(403);
    }
    await mf.dispose();
    const scan = async (path: string): Promise<void> => { for (const e of await readdir(path, { withFileTypes: true })) { const p = join(path, e.name); if (e.isDirectory()) await scan(p); else expect((await readFile(p)).includes(Buffer.from('INERT_'))).toBe(false); } }; await scan(dir);
  } finally { await mf.dispose().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
}, 30_000);
