import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { harness } from './worker-harness';

// Native broker + SQLite browser/grant authorities. Test-only bindings expose
// opaque storage snapshots; identity and grant commits still use real routes.
it.each([{ missingCookie: false, race: 'replacement' }, { missingCookie: true, race: 'replacement' }, { missingCookie: false, race: 'aba' }, { missingCookie: true, race: 'aba' }, { missingCookie: false, race: 'revoke-all' }, { missingCookie: true, race: 'revoke-all' }, { missingCookie: false, race: 'disconnect' }, { missingCookie: true, race: 'disconnect' }])('native full dashboard recovery %j and paused authority race', async ({ missingCookie, race }) => {
  const h = await harness();
  const output = await build({ stdin: { contents: `import worker,{AccountBrowserSessions as Browser,AccountGrantObject as Grant} from './account/broker';
export class AccountBrowserSessions extends Browser{constructor(s,e){super(s,e);this.saved=s;}async fetch(r){const b=await r.clone().json();if(b.operation==='__snapshot')return Response.json(Array.from(await this.saved.storage.list()).filter(([k])=>!k.startsWith('activation:')));return super.fetch(r);}}
export class AccountGrantObject extends Grant{constructor(s,e){super(s,e);this.saved=s;}async fetch(r){if(new URL(r.url).pathname==='/__grant')return Response.json(await this.saved.storage.get('grant')??null);return super.fetch(r);}}
export default{async fetch(r,e,c){const p=new URL(r.url).pathname;if(p==='/__op')return e.ACCOUNT_BROWSER_SESSIONS.get(e.ACCOUNT_BROWSER_SESSIONS.idFromName('account-authority-v2')).fetch(r);if(p==='/__grant'){const b=await r.json();return e.ACCOUNT_GRANTS.get(e.ACCOUNT_GRANTS.idFromName(b.subject)).fetch('https://internal.invalid/__grant',{method:'POST'});}return worker.fetch(r,e,c);}}`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  let pause: { kind: 'identity' | 'repository'; entered: () => void; wait: Promise<void> } | undefined, release: (() => void) | undefined;
  const calls: string[] = [];
  const bindings = { ...Object.fromEntries(Object.entries(h.env).filter(([, v]) => typeof v === 'string')), ACCOUNT_LOGIN_CALLBACK: h.env.ACCOUNT_ISSUER + '/account/callback', BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) };
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings, kvNamespaces: ['ACCOUNT_CONNECTOR_KV'], durableObjects: { ACCOUNT_BROWSER_SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true }, ACCOUNT_GRANTS: { className: 'AccountGrantObject', useSQLite: true } }, outboundService: async (request: import('miniflare').Request) => {
    calls.push(request.method + ' ' + request.url);
    if (request.method === 'POST' && request.url === 'https://github.com/login/oauth/access_token') {
      const identity = (await request.text()).includes(encodeURIComponent('/account/callback'));
      if (pause?.kind === (identity ? 'identity' : 'repository')) { const captured = pause; pause = undefined; captured.entered(); await captured.wait; }
      return Response.json(identity ? { access_token: 'INERT_IDENTITY', token_type: 'bearer', scope: 'read:user' } : { access_token: 'INERT_REPO', refresh_token: 'INERT_REFRESH', token_type: 'bearer', scope: 'repo', expires_in: 3600, refresh_token_expires_in: 7200 });
    }
    if (request.method === 'GET' && request.url === 'https://api.github.com/user') return Response.json({ id: 1001 }, { headers: { 'x-oauth-scopes': request.headers.get('Authorization')?.includes('IDENTITY') ? 'read:user' : 'repo' } });
    throw Error('Unlisted synthetic provider destination');
  } });
  const browser = crypto.randomUUID().replaceAll('-', '').repeat(2), jar = new Map<string, string>([['__Host-account_browser', browser]]);
  const send = async (path: string, method = 'GET', body?: string) => {
    const response = await mf.dispatchFetch(h.env.ACCOUNT_ISSUER + path, { method, body, redirect: 'manual', headers: { Origin: h.env.ACCOUNT_ISSUER, Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') } });
    for (const value of response.headers.getSetCookie()) { if (path !== '/account/revoke-all-local-browser-sessions') expect(value).not.toMatch(/^__Host-account_continuation=;/); const [pair] = value.split(';'), i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return response;
  };
  const op = async (body: Record<string, unknown>) => { const r = await send('/__op', 'POST', JSON.stringify(body)); expect(r.status).toBe(200); return r.json() as Promise<any>; };
  const fields = (html: string, action: string) => {
    const selected = [...html.matchAll(/<form\b[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].find(m => m[1] === action);
    expect(selected, 'rendered form ' + action).toBeTruthy(); const values = new URLSearchParams();
    for (const [, key, value] of selected![2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) values.set(key, value.replace(/&amp;/g, '&'));
    return values;
  };
  const intent = { clientId: 'fixture', redirectUri: 'https://client.example.test/callback', state: 'OLD_CONNECTOR_MUST_NOT_RESUME', responseType: 'code', codeChallenge: 'c'.repeat(43), codeChallengeMethod: 'S256', resource: h.env.RESOURCE, scope: ['repository:read'] };
  const signin = async (path: string) => {
    const page = await send(path); expect(page.status).toBe(200); const html = await page.text(); expect(html).toContain('name="viewport" content="width=device-width,initial-scale=1"');
    const form = fields(html, '/account/signin'); expect(form.get('restart')).toBe('standalone');
    const start = await send('/account/signin', 'POST', form.toString()); expect(start.status).toBe(303); const target = new URL(start.headers.get('Location')!); expect(target.searchParams.get('scope')).toBe('read:user');
    const done = await send('/account/callback?code=identity&state=' + target.searchParams.get('state')); expect(done.status).toBe(303); expect(done.headers.get('Location')).toBe('/account');
  };
  const dashboard = async () => { const r = await send('/account'); expect(r.status).toBe(200); const html = await r.text(); expect(html).not.toContain('INERT_'); expect(html).not.toContain(intent.state); return html; };
  const startRepo = async (form: URLSearchParams) => { const r = await send('/account/repositories/connect', 'POST', form.toString()); expect(r.status).toBe(303); const u = new URL(r.headers.get('Location')!); expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize'); expect(u.searchParams.get('scope')).toBe('repo offline_access'); return u.searchParams.get('state')!; };
  try {
    const old = await op({ operation: 'continuation-create', handle: browser, intent }); await op({ operation: 'continuation-retire', handle: browser, ref: old.ref }); if (!missingCookie) jar.set('__Host-account_continuation', old.ref);
    await signin('/account/signin?restart=standalone');
    let html = await dashboard(); const verify = html.match(/href="([^"]+)"[^>]*>Verify again/); expect(verify?.[1]).toBe('/account/signin?restart=standalone'); await signin(verify![1]);
    html = await dashboard(); const connect = fields(html, '/account/repositories/connect'); expect(connect.get('purpose')).toBe('account'); expect(connect.has('continuation')).toBe(false);
    const state = await startRepo(connect), pendingHtml = await dashboard(), cancel = fields(pendingHtml, '/account/repositories/cancel'); expect(cancel.get('purpose')).toBe('account'); expect(cancel.get('lease')).toBeTruthy();
    const wrong = new URLSearchParams(cancel); wrong.set('lease', 'f'.repeat(64)); expect((await send('/account/repositories/cancel', 'POST', wrong.toString())).status).toBe(503);
    const completed = await send('/oauth/callback?code=repository&state=' + state); expect(completed.status).toBe(303); expect(completed.headers.get('Location')).toBe('/account'); expect(await dashboard()).toContain('Repository access connected.');
    expect(jar.get('__Host-account_continuation')).toBe(missingCookie ? undefined : old.ref);
    const handle = jar.get('__Host-account_session')!, active = await op({ operation: 'load', handle });
    const grant = async () => (await send('/__grant', 'POST', JSON.stringify({ subject: active.identity.subject }))).json(); const prior = await grant() as { generation: number; epoch: number; status: string; encrypted?: string }; expect(prior).toBeTruthy(); expect(JSON.stringify(prior)).not.toContain('INERT_REPO');
    expect((await send('/account/continue')).status).toBeGreaterThanOrEqual(400);
    if (race === 'revoke-all' || race === 'disconnect') {
      // Capture actual connected-dashboard controls before an explicit API
      // reconnect. There is no rendered Reconnect button in this fixture.
      const connected = await dashboard();
      const disconnect = fields(connected, '/account/disconnect');
      const endPath = race === 'disconnect' ? '/account/disconnect' : '/account/revoke-all-local-browser-sessions';
      const nextState = await startRepo(new URLSearchParams({ csrf: disconnect.get('csrf')!, purpose: 'account' }));
      let entered!: () => void; const waiting = new Promise<void>(r => { entered = r; });
      pause = { kind: 'repository', entered, wait: new Promise<void>(r => { release = r; }) };
      const callback = send('/oauth/callback?code=late-after-authority-end&state=' + nextState); await waiting;
      // Prepare rotates CSRF. Revoke-all remains rendered while pending;
      // Disconnect is an explicit API request using that current rendered CSRF.
      const endForm = fields(await dashboard(), '/account/revoke-all-local-browser-sessions');
      const ended = await send(endPath, 'POST', endForm.toString());
      expect(ended.status).toBe(303); expect(ended.headers.get('Location')).toBe('/account');
      const afterEnd = await grant();
      if (race === 'disconnect') {
        expect(afterEnd).toEqual({ generation: prior.generation + 1, epoch: prior.generation + 1, status: 'revoked' });
        expect(jar.get('__Host-account_session')).toBe(handle);
      } else {
        // Browser-session revocation deliberately does not revoke repository access.
        expect(afterEnd).toEqual(prior);
        expect(jar.get('__Host-account_session')).toBe('');
        expect(jar.get('__Host-account_continuation')).toBe('');
        expect((await send('/__op', 'POST', JSON.stringify({ operation: 'load', handle }))).status).not.toBe(200);
      }
      const snapshot = await op({ operation: '__snapshot' }), cookies = [...jar];
      release!(); expect((await callback).status).toBe(503);
      expect(await grant()).toEqual(afterEnd); expect(await op({ operation: '__snapshot' })).toEqual(snapshot); expect([...jar]).toEqual(cookies);
      // A second delivery of the old callback cannot advance or restore the grant.
      expect((await send('/oauth/callback?code=late-replay&state=' + nextState)).status).toBe(race === 'revoke-all' ? 403 : 503);
      expect(await grant()).toEqual(afterEnd);
      if (race === 'disconnect') expect(await dashboard()).toContain('Repository access is not connected.');
      else expect((await send('/account')).status).toBe(303);
      expect(calls.every(c => c === 'POST https://github.com/login/oauth/access_token' || c === 'GET https://api.github.com/user')).toBe(true);
      return;
    }
    // Reverse ordering: Verify started first cannot rotate the current session
    // after a later account-purpose Connect has captured its authority lease.
    const verifyForm = fields(await (await send('/account/signin?restart=standalone')).text(), '/account/signin');
    const verifyStart = await send('/account/signin', 'POST', verifyForm.toString()); expect(verifyStart.status).toBe(303);
    let identityEntered!: () => void; const identityWaiting = new Promise<void>(r => { identityEntered = r; });
    pause = { kind: 'identity', entered: identityEntered, wait: new Promise<void>(r => { release = r; }) };
    const identityCallback = send('/account/callback?code=paused-identity&state=' + new URL(verifyStart.headers.get('Location')!).searchParams.get('state'));
    await identityWaiting;
    const beforeConnect = fields(await dashboard(), '/account/disconnect');
    await startRepo(new URLSearchParams({ csrf: beforeConnect.get('csrf')!, purpose: 'account' }));
    const held = await op({ operation: '__snapshot' }); release!();
    expect((await identityCallback).status).toBe(503); expect(await op({ operation: '__snapshot' })).toEqual(held); expect(await grant()).toEqual(prior); expect(jar.get('__Host-account_session')).toBe(handle);
    const reverseCancel = fields(await dashboard(), '/account/repositories/cancel'); expect((await send('/account/repositories/cancel', 'POST', reverseCancel.toString())).status).toBe(303);
    // Explicit account reconnect races keep the real previously committed grant.
    // Connected dashboards render Disconnect rather than Connect; reuse only
    // the CSRF from that actual form with an explicit account-purpose API POST.
    for (const kind of ['cancel', race]) {
      const current = fields(await dashboard(), '/account/disconnect');
      const form = new URLSearchParams({ csrf: current.get('csrf')!, purpose: 'account' });
      const nextState = await startRepo(form); const cancelForm = fields(await dashboard(), '/account/repositories/cancel');
      let entered!: () => void; const waiting = new Promise<void>(r => { entered = r; }); const wait = new Promise<void>(r => { release = r; }); pause = { kind: 'repository', entered, wait };
      const callback = send('/oauth/callback?code=paused&state=' + nextState); await waiting;
      if (kind === 'cancel') { expect((await send('/account/repositories/cancel', 'POST', cancelForm.toString())).status).toBe(303); }
      else { const replacement = await op({ operation: 'continuation-create', handle: browser, activeHandle: handle, intent: { ...intent, state: kind } }); jar.set('__Host-account_continuation', replacement.ref); if (kind === 'aba') await op({ operation: 'continuation-retire', handle: browser, ref: replacement.ref }); }
      const snapshot = await op({ operation: '__snapshot' }); release!(); expect((await callback).status).toBe(503); expect(await grant()).toEqual(prior); expect(await op({ operation: '__snapshot' })).toEqual(snapshot); expect(jar.get('__Host-account_session')).toBe(handle);
    }
    expect(calls.every(c => c === 'POST https://github.com/login/oauth/access_token' || c === 'GET https://api.github.com/user')).toBe(true);
  } finally { release?.(); await mf.dispose(); }
}, 30000);
