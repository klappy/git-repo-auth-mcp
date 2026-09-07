import { it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const managed = { access_token: 'INERT_MANAGED_ACCESS', refresh_token: 'INERT_MANAGED_REFRESH', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'managed-A' }, provider_token: 'INERT_PROVIDER_ACCESS', provider_refresh_token: 'INERT_PROVIDER_REFRESH', user_metadata: { unsafe: 'INERT_PRIVATE_METADATA' } };
it('actual local DO restart preserves encrypted sessions, one-use CSRF and immutable bidirectional identities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'account-browser-test-'));
  const output = await build({ stdin: { contents: `export {AccountBrowserSessions} from './account/browser-session';export {AccountIdentityRegistry} from './account/identity-registry';export default {fetch(r,e){const binding=new URL(r.url).pathname==='/identity'?e.IDENTITIES:e.SESSIONS;return binding.get(binding.idFromName('fixed-test-object')).fetch(r)}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
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
    expect((await call('/', { operation: 'consume', handle: browser, nonce: begin.nonce })).status).toBe(200);
    expect((await call('/', { operation: 'consume', handle: browser, nonce: begin.nonce })).status).toBe(403);
    const active = await (await call('/', { operation: 'activate', identity, managed })).json() as { handle: string; csrf: string };
    expect(active.handle).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(active)).not.toContain('INERT_');
    await mf.dispose(); mf = start();
    expect((await call('/identity', { operation: 'verify', identity })).status).toBe(200);
    const loaded = await call('/', { operation: 'load', handle: active.handle }); expect(loaded.status).toBe(200); expect(await loaded.text()).not.toMatch(/INERT_PROVIDER|INERT_PRIVATE/);
    expect((await call('/', { operation: 'csrf', handle: '3'.repeat(64), nonce: active.csrf })).status).toBe(403);
    expect((await call('/', { operation: 'csrf', handle: active.handle, nonce: active.csrf })).status).toBe(200);
    expect((await call('/', { operation: 'csrf', handle: active.handle, nonce: active.csrf })).status).toBe(403);
    await call('/', { operation: 'invalidate', handle: active.handle });
    await mf.dispose(); mf = start(); expect((await call('/', { operation: 'load', handle: active.handle })).status).toBe(403);
    await mf.dispose();
    const scan = async (path: string): Promise<void> => { for (const e of await readdir(path, { withFileTypes: true })) { const p = join(path, e.name); if (e.isDirectory()) await scan(p); else expect((await readFile(p)).includes(Buffer.from('INERT_'))).toBe(false); } }; await scan(dir);
  } finally { await mf.dispose().catch(() => {}); await rm(dir, { recursive: true, force: true }); }
}, 30_000);
