import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { harness } from './worker-harness';

// Real broker and SQLite authority. Only the provider, synthetic expiry and
// explicitly selected transport faults are test seams; no elapsed-time claim.
async function fixture() {
  const h = await harness();
  const built = await build({ stdin: { contents: `import worker,{AccountBrowserSessions as Browser,AccountGrantObject} from './account/broker';
import {compactDecrypt,CompactEncrypt} from 'jose';
export {AccountGrantObject};
export class AccountBrowserSessions extends Browser {
 constructor(s,e){super(s,e);this.saved=s;this.fail='';}
 async fetch(r){const b=await r.clone().json();
 if(b.operation==='__snapshot')return Response.json(Array.from(await this.saved.storage.list()));
 if(b.operation==='__fault'){this.fail=b.target;return Response.json({ok:true});}
 if(this.fail===b.operation){this.fail='';return Response.json({error:'synthetic temporary failure'},{status:503});}
 if(b.operation==='__expire'){
  for(const [k,v] of await this.saved.storage.list()){if(typeof v!=='string')continue;let value;try{value=JSON.parse(new TextDecoder().decode((await compactDecrypt(v,new Uint8Array(32).fill(0xab))).plaintext));}catch{continue;}
   if(value.status==='active'&&value.browserHandle===b.browser){value.idleUntil=Date.now()-1;await this.saved.storage.put(k,await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value))).setProtectedHeader({alg:'dir',enc:'A256GCM',typ:'account-browser-v2+jwe',kid:'browser-v2'}).encrypt(new Uint8Array(32).fill(0xab)));return Response.json({expired:true});}}
  return Response.json({error:'missing session'},{status:404});}
 return super.fetch(r);}}
export default{async fetch(r,e,c){if(new URL(r.url).pathname==='/__op')return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r);return worker.fetch(r,e,c);}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  let githubId = 1001;
  let tokenPause: { entered: () => void; wait: Promise<void> } | undefined;
  const mf = new Miniflare({ modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false,
    bindings: { ...Object.fromEntries(Object.entries(h.env).filter(([, v]) => typeof v === 'string')), ACCOUNT_LOGIN_CALLBACK: h.env.ACCOUNT_ISSUER + '/account/callback', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) },
    kvNamespaces: ['ACCOUNT_CONNECTOR_KV'], durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true }, ACCOUNT_GRANTS: { className: 'AccountGrantObject', useSQLite: true } },
    outboundService: async (r: import('miniflare').Request) => {
      if (r.method === 'POST' && r.url === 'https://github.com/login/oauth/access_token') { if (tokenPause) { const p = tokenPause; tokenPause = undefined; p.entered(); await p.wait; } return Response.json({ access_token: 'INERT_IDENTITY', token_type: 'bearer', scope: 'read:user' }); }
      if (r.method === 'GET' && r.url === 'https://api.github.com/user') return Response.json({ id: githubId }, { headers: { 'x-oauth-scopes': 'read:user' } });
      throw Error('Unlisted synthetic provider destination');
    } });
  const browser = crypto.randomUUID().replaceAll('-', '').repeat(2), jar = new Map([['__Host-account_browser', browser]]);
  const send = async (path: string, method = 'GET', body?: string) => {
    const r = await mf.dispatchFetch(h.env.ACCOUNT_ISSUER + path, { method, body, redirect: 'manual', headers: { Origin: h.env.ACCOUNT_ISSUER, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    for (const value of r.headers.getSetCookie()) { const pair = value.split(';')[0], i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return r;
  };
  const op = async (body: Record<string, unknown>) => { const r = await send('/__op', 'POST', JSON.stringify(body)); expect(r.status).toBe(200); return r.json() as Promise<any>; };
  const form = (html: string, action = '/account/signin') => {
    const match = [...html.matchAll(/<form\b[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].find(m => m[1] === action); expect(match, `rendered ${action}`).toBeTruthy();
    const p = new URLSearchParams(); for (const [, name, value] of match![2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) p.set(name, value.replace(/&amp;/g, '&')); return p;
  };
  const complete = async (html: string, id: number) => {
    githubId = id; const start = await send('/account/signin', 'POST', form(html).toString()); expect(start.status).toBe(303);
    const target = new URL(start.headers.get('Location')!); expect(target.origin + target.pathname).toBe('https://github.com/login/oauth/authorize'); expect(target.searchParams.get('scope')).toBe('read:user');
    return send('/account/callback?code=synthetic&state=' + target.searchParams.get('state'));
  };
  const signinPage = async () => {
    let path = '/account';
    for (let n = 0; n < 5; n++) {
      const r = await send(path); const location = r.headers.get('Location');
      if (location) { expect(['/account/signin', '/account/continue', '/account/signin?restart=standalone']).toContain(location); path = location; continue; }
      const html = await r.text(); expect(html).toContain('name="viewport"'); expect(r.headers.get('Cache-Control')).toContain('no-store');
      if (html.includes('action="/account/signin"')) return html;
      const link = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]).find(href => ['/account/continue', '/account/signin', '/account/signin?restart=standalone'].includes(href));
      expect(link, 'fixed rendered recovery destination').toBeTruthy(); path = link!;
    }
    throw Error('Recovery did not reach a sign-in form');
  };
  const first = await send('/account/signin?restart=standalone'); expect((await complete(await first.text(), 1001)).status).toBe(303);
  const pause = () => { let entered!: () => void, release!: () => void; const waiting = new Promise<void>(r => { entered = r; }); tokenPause = { entered, wait: new Promise<void>(r => { release = r; }) }; return { waiting, release }; };
  return { mf, browser, jar, send, op, form, complete, signinPage, pause, resource: h.env.RESOURCE };
}

it.each([false, true].flatMap(live => [1001, 1002].map(id => ({ live, id }))))('native expired entry follows rendered recovery with identity binding %j', async ({ live, id }) => {
  const f = await fixture(); try {
    const handle = f.jar.get('__Host-account_session')!;
    const intent = { clientId: 'fixture', redirectUri: 'https://client.example.test/callback', state: 'ORIGINAL_INTENT', responseType: 'code', codeChallenge: 'c'.repeat(43), codeChallengeMethod: 'S256', resource: f.resource, scope: ['repository:read'] };
    const flow = live ? await f.op({ operation: 'continuation-create', handle: f.browser, activeHandle: handle, intent }) : undefined;
    if (flow) f.jar.set('__Host-account_continuation', flow.ref);
    await f.op({ operation: '__expire', browser: f.browser });
    const before = await f.op({ operation: '__snapshot' }), cookies = [...f.jar];
    const entry = await f.send('/account'); expect(entry.headers.getSetCookie()).toEqual([]); expect(await f.op({ operation: '__snapshot' })).toEqual(before); expect([...f.jar]).toEqual(cookies);
    const html = await f.signinPage(), result = await f.complete(html, id);
    if (id === 1001) {
      expect(result.status).toBe(303); expect(result.headers.get('Location')).toBe(live ? '/account/continue' : '/account');
      const recovered = await f.op({ operation: 'load', handle: f.jar.get('__Host-account_session') }); expect(recovered.identity.githubId).toBe(1001); expect(f.jar.get('__Host-account_session')).not.toBe(handle);
      if (flow) { const retained = await f.op({ operation: 'continuation-load', handle: f.browser, ref: flow.ref, activeHandle: f.jar.get('__Host-account_session') }); expect(retained.intent).toEqual(intent); expect(retained.expiresAt).toBe(flow.expiresAt); }
      else expect((await f.send('/account')).status).toBe(200);
    } else { expect(result.status).toBe(503); expect(f.jar.get('__Host-account_session')).toBe(handle); expect((await f.send('/__op', 'POST', JSON.stringify({ operation: 'load', handle }))).status).toBe(403); }
  } finally { await f.mf.dispose(); }
}, 30000);

it.each(['replacement', 'signout', 'revoke-all', 'repository-lease'])('native recovery callback denies after paused-provider %s', async action => {
  const f = await fixture(); let release: (() => void) | undefined, callback: ReturnType<typeof f.complete> | undefined;
  try {
    const handle = f.jar.get('__Host-account_session')!;
    const html = await f.signinPage(), paused = f.pause(); release = paused.release;
    callback = f.complete(html, 1001); await paused.waiting;
    if (action === 'replacement') expect((await f.complete(await f.signinPage(), 1001)).status).toBe(303);
    else {
      const page = await f.send('/account'), dashboard = await page.text();
      if (action === 'repository-lease') {
        const form = f.form(dashboard, '/account/repositories/connect');
        await f.op({ operation: 'repository-account-prepare', handle, nonce: form.get('csrf') });
      } else {
        const path = action === 'signout' ? '/account/signout' : '/account/revoke-all-local-browser-sessions';
        expect((await f.send(path, 'POST', f.form(dashboard, path).toString())).status).toBe(303);
      }
    }
    const stable = (values: [string, unknown][]) => values.filter(([key]) => !key.startsWith('activation:'));
    const before = stable(await f.op({ operation: '__snapshot' })), cookies = [...f.jar];
    release(); expect((await callback).status).toBe(503);
    expect(stable(await f.op({ operation: '__snapshot' }))).toEqual(before); expect([...f.jar]).toEqual(cookies);
    if (action === 'replacement') { expect(f.jar.get('__Host-account_session')).not.toBe(handle); expect((await f.op({ operation: 'load', handle: f.jar.get('__Host-account_session') })).identity.githubId).toBe(1001); }
  } finally { release?.(); if (callback) await callback.catch(() => {}); await f.mf.dispose(); }
}, 30000);

it.each(['missing-cookie', 'load-failure', 'entry-failure'])('native entry never forgets authoritative identity after %s', async kind => {
  const f = await fixture(); try {
    const handle = f.jar.get('__Host-account_session')!;
    if (kind === 'missing-cookie') f.jar.delete('__Host-account_session');
    else await f.op({ operation: '__fault', target: kind === 'load-failure' ? 'load' : 'entry' });
    const before = await f.op({ operation: '__snapshot' }), cookies = [...f.jar];
    const entry = await f.send('/account'); expect(entry.headers.getSetCookie()).toEqual([]); expect([...f.jar]).toEqual(cookies); expect(await f.op({ operation: '__snapshot' })).toEqual(before);
    if (kind !== 'missing-cookie') { const body = await entry.text(); expect(body).not.toContain('cannot be resumed'); expect(body).toContain('/account'); }
    // Follow the fixed retry, then the actual dashboard Verify/recovery link.
    const result = await f.complete(await f.signinPage(), 1002); expect(result.status).toBe(503);
    expect((await f.op({ operation: 'load', handle })).identity.githubId).toBe(1001);
    expect(f.jar.get('__Host-account_session')).toBe(kind === 'missing-cookie' ? undefined : handle);
  } finally { await f.mf.dispose(); }
}, 30000);

it('native epoch-revoked entry requires explicit local signout before fresh identity', async () => {
  const f = await fixture(); try {
    const original = [...f.jar], oldHandle = f.jar.get('__Host-account_session')!;
    // A separate browser of the same account performs real revoke-all, leaving
    // the first browser's authenticated record present but epoch-revoked.
    f.jar.clear(); f.jar.set('__Host-account_browser', crypto.randomUUID().replaceAll('-', '').repeat(2));
    expect((await f.complete(await f.signinPage(), 1001)).status).toBe(303);
    const otherDashboard = await f.send('/account');
    const revoke = f.form(await otherDashboard.text(), '/account/revoke-all-local-browser-sessions');
    expect((await f.send('/account/revoke-all-local-browser-sessions', 'POST', revoke.toString())).status).toBe(303);
    f.jar.clear(); for (const [k, v] of original) f.jar.set(k, v);
    const before = await f.op({ operation: '__snapshot' });
    const entry = await f.send('/account'), html = await entry.text();
    expect(entry.status).toBe(200); expect(entry.headers.getSetCookie()).toEqual([]); expect(entry.headers.get('Cache-Control')).toContain('no-store'); expect(html).toContain('name="viewport"');
    expect(html).toContain('including a replacement completed before you submit');
    expect(await f.op({ operation: '__snapshot' })).toEqual(before); expect([...f.jar]).toEqual(original);
    const end = f.form(html, '/account/signout');
    expect((await f.send('/account/signout', 'POST', end.toString())).status).toBe(303);
    expect(f.jar.get('__Host-account_session')).toBe('');
    expect((await f.complete(await f.signinPage(), 1002)).status).toBe(303);
    const replacement = f.jar.get('__Host-account_session')!;
    expect((await f.op({ operation: 'load', handle: replacement })).identity.githubId).toBe(1002);
    expect((await f.send('/__op', 'POST', JSON.stringify({ operation: 'load', handle: oldHandle }))).status).toBe(403);
    // A consumed signout proof was deleted: replay cannot end a fresh identity.
    f.jar.set('__Host-account_session', oldHandle);
    expect((await f.send('/account/signout', 'POST', end.toString())).status).toBe(503);
    expect((await f.op({ operation: 'load', handle: replacement })).identity.githubId).toBe(1002);
  } finally { await f.mf.dispose(); }
}, 30000);

it('native explicit retained-handle signout may end an intervening identity replacement', async () => {
  const f = await fixture(); try {
    const oldHandle = f.jar.get('__Host-account_session')!;
    const page = await f.send('/account'), end = f.form(await page.text(), '/account/signout');
    expect((await f.complete(await f.signinPage(), 1001)).status).toBe(303);
    const replacement = f.jar.get('__Host-account_session')!; expect(replacement).not.toBe(oldHandle);
    // Simulate the old form's explicit request being delayed with its captured
    // Cookie/CSRF pair. No replacement CSRF is inspected or exported.
    f.jar.set('__Host-account_session', oldHandle);
    expect((await f.send('/account/signout', 'POST', end.toString())).status).toBe(303);
    expect((await f.send('/__op', 'POST', JSON.stringify({ operation: 'load', handle: replacement }))).status).toBe(403);
    expect(f.jar.get('__Host-account_session')).toBe('');
  } finally { await f.mf.dispose(); }
}, 30000);
