import { expect, it } from 'vitest';
import { createAccountRoutes, type AccountBrowserEnv } from '../../account/account-routes';
import { productionLogin } from '../../account/login';
import { recoveryNotice, type RecoveryReference } from '../../account/recovery';
import { BrowserSessions } from '../../account/browser-session';
import { exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const secret = 'INERT_SECRET_<script>alert(1)</script>';
const callback = 'https://account.example.test/account/callback';
it.each(['provider-exchange', 'provider-response', 'provider-identity'] as const)('identifies %s without preserving provider exceptions or credentials', async phase => {
  const adapter = productionLogin({ clientId: 'synthetic', clientSecret: secret, callback, fetch: async url => {
    if (phase === 'provider-exchange') throw new Error(secret);
    if (phase === 'provider-response') return new Response(secret, { headers: { 'Content-Type': 'text/html' } });
    if (String(url).endsWith('/user')) return Response.json({ id: secret }, { headers: { 'x-oauth-scopes': 'read:user' } });
    return Response.json({ access_token: secret, token_type: 'bearer', scope: 'read:user' });
  } });
  const start = await adapter.begin();
  const error = await adapter.complete({ url: new URL(callback + '?code=synthetic&state=' + start.transaction.state), transaction: start.transaction }).catch(e => e);
  expect(error.reference).toBe(phase); expect(error.message).toBe('access_denied');
  expect(JSON.stringify(error)).not.toContain(secret); expect(error.cause).toBeUndefined();
});
it.each(['callback-request', 'callback-cookies', 'callback-transaction', 'session-activation', 'session-load'] as const)('renders fixed %s without request or exception data', async phase => {
  const operations: string[] = [];
  const env = { PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://account.example.test', ACCOUNT_LOGIN_CALLBACK: callback,
    ACCOUNT_BROWSER_SESSIONS: { idFromName: () => 'synthetic', get: () => ({ fetch: async (_url: string, init: RequestInit) => {
      const value = JSON.parse(String(init.body)); operations.push(value.operation);
      if ((phase === 'callback-transaction' && value.operation === 'consume') || (phase === 'session-activation' && value.operation === 'activate') || (phase === 'session-load' && value.operation === 'load')) throw new Error(secret);
      if (value.operation === 'consume') return Response.json({ transaction: {}, proof: 'synthetic-proof', continuation: true });
      return Response.json({ handle: 'synthetic-session' });
    } }) }
  } as unknown as AccountBrowserEnv;
  const routes = createAccountRoutes({ begin: async () => { throw new Error('unused'); }, complete: async () => ({ githubId: 1001 }) });
  const result = await routes(new Request(callback + '?code=' + encodeURIComponent(secret) + '&state=synthetic', { method: phase === 'callback-request' ? 'POST' : 'GET', headers: { Cookie: '__Host-account_continuation=synthetic;' + (phase === 'callback-cookies' ? '' : '__Host-account_browser=synthetic; __Host-account_login=synthetic') } }), env, async () => new Response('unused'));
  expect(result!.status).toBe(503); expect(result!.headers.get('Cache-Control')).toBe('private, no-store');
  const html = await result!.text(); expect(html).toContain(`<code>${phase}</code>`); expect(html).not.toContain(secret); expect(html).not.toContain('synthetic');
  if (phase === 'session-activation') expect(operations).toContain('discard');
});
it('does not reflect an unknown recovery reference', () => {
  expect(recoveryNotice(secret as RecoveryReference)).toBe('');
});

it('real production login activates encrypted browser authority and reaches signed account bootstrap', async () => {
  const data = new Map<string, unknown>();
  const storage = {
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') data.set(key, structuredClone(value)); else for (const [k, v] of Object.entries(key)) data.set(k, structuredClone(v)); },
    async delete(key: string) { return data.delete(key); },
    async list({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)); },
    async transaction<T>(fn: (tx: unknown) => Promise<T>) { const before = new Map(data); try { return await fn(storage); } catch (e) { data.clear(); for (const [k, v] of before) data.set(k, v); throw e; } }
  };
  const sessions = new BrowserSessions(storage as unknown as DurableObjectStorage, new Uint8Array(32).fill(7));
  const adapter = productionLogin({ clientId: 'synthetic', clientSecret: secret, callback, fetch: async (url, init) => {
    if (String(url).endsWith('/user')) return Response.json({ id: 1001 }, { headers: { 'x-oauth-scopes': 'read:user' } });
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
    // GitHub's documented identity response has no required expiry or refresh token.
    return Response.json({ access_token: 'INERT_IDENTITY', token_type: 'bearer', scope: 'read:user' });
  } });
  const browserHandle = 'a'.repeat(64), pending = await sessions.begin(browserHandle), start = await adapter.begin();
  await sessions.start(browserHandle, pending.nonce, start.transaction);
  const key = await generateKeyPair('ES256', { extractable: true });
  let failBootstrap = false, bootstrapCount = 0;
  const env = { PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://account.example.test', ACCOUNT_LOGIN_CALLBACK: callback, SERVICE: 'navigator', RESOURCE: 'https://navigator.example.test/mcp', BROKER_AUDIENCE: 'https://broker.example.test/read', ACCOUNT_SIGNING_JWK: JSON.stringify({ ...await exportJWK(key.privateKey), kid: 'fixture' }),
    ACCOUNT_BROWSER_SESSIONS: { idFromName: () => 'synthetic', get: () => ({ fetch: async (_url: string, init: RequestInit) => {
      const v = JSON.parse(String(init.body));
      switch (v.operation) {
        case 'consume': return Response.json(await sessions.consume(v.handle, v.nonce, v.state, v.continuationRef));
        case 'activate': return Response.json(await sessions.activate(v.githubId, v.proof));
        case 'load': return Response.json(await sessions.load(v.handle));
        case 'entry': return Response.json(await sessions.entry(v.handle, v.activeHandle, v.continuationRef));
        case 'touch': return Response.json(await sessions.touch(v.handle));
        case 'verify': return Response.json(await sessions.verify(v.identity));
        case 'repository-start-status': return Response.json({ blocked: false });
        default: throw new Error('unexpected operation');
      }
    } }) },
    ACCOUNT_GRANTS: { idFromName: () => 'synthetic', get: () => ({ fetch: async (request: Request) => {
      bootstrapCount++; if (failBootstrap) throw new Error(secret);
      const verified = await jwtVerify(request.headers.get('Authorization')!.slice(7), key.publicKey, { issuer: 'https://account.example.test', audience: 'https://broker.example.test/read' });
      expect(verified.payload.github_id).toBe(1001);
      return Response.json({ generation: 1, status: 'absent' });
    } }) }
  } as unknown as AccountBrowserEnv;
  const routes = createAccountRoutes(adapter), broker = async () => new Response('unused');
  const callbackRequest = new Request(callback + '?code=synthetic&state=' + start.transaction.state, { headers: { Cookie: `__Host-account_browser=${browserHandle}; __Host-account_login=${pending.nonce}` } });
  const result = await routes(callbackRequest, env, broker); expect(result!.status, await result!.clone().text()).toBe(303); expect(result!.headers.get('Location')).toBe('/account');
  const sessionCookie = result!.headers.get('Set-Cookie')!.match(/__Host-account_session=([^;]+)/)![0];
  const request = () => new Request('https://account.example.test/account', { headers: { Cookie: sessionCookie + '; __Host-account_browser=' + browserHandle } });
  const page = await routes(request(), env, broker); expect(page!.status).toBe(200); expect(await page!.text()).toContain('Repository access is not connected.'); expect(bootstrapCount).toBe(1);
  expect((await routes(callbackRequest, env, broker))!.status).toBe(503); // One-use transaction remains spent.
  failBootstrap = true;
  const failure = await routes(request(), env, broker), html = await failure!.text(); expect(failure!.status).toBe(503); expect(html).toContain('<code>account-bootstrap</code>'); expect(html).not.toContain(secret);
  expect(JSON.stringify([...data.values()])).not.toContain('INERT_IDENTITY');
});

it.each(['standalone', 'connector', 'connector-extra-signin-get'])('local workerd completes the production adapter callback through the actual browser DO and signed bootstrap: %s', async mode => {
  const key = await generateKeyPair('ES256', { extractable: true });
  const output = await build({ stdin: { contents: `
    export {AccountBrowserSessions} from './account/browser-session';
    import {createAccountRoutes} from './account/account-routes';
    import {productionLogin} from './account/login';
    import {jwtVerify,importJWK} from 'jose';
    const adapter=productionLogin({clientId:'synthetic',clientSecret:'INERT_CLIENT',callback:'${callback}',fetch:async(url,init)=>{
      if(String(url)==='https://api.github.com/user')return Response.json({id:1001},{headers:{'x-oauth-scopes':'read:user'}});
      if(String(url)!=='https://github.com/login/oauth/access_token'||new Headers(init.headers).get('accept')!=='application/json')throw new Error('unexpected synthetic transport');
      return Response.json({access_token:'INERT_IDENTITY',token_type:'bearer',scope:'read:user'});
    }});
    const routes=createAccountRoutes(adapter);
    export default {async fetch(r,e){
      if(new URL(r.url).pathname==='/fixture/continuation'){
        await e.ACCOUNT_CONNECTOR_KV.put('client:synthetic',JSON.stringify({clientId:'synthetic',clientName:'Synthetic connector',redirectUris:['https://chatgpt.com/connector/oauth/synthetic'],tokenEndpointAuthMethod:'none',grantTypes:['authorization_code'],responseTypes:['code']}));
        const handle='a'.repeat(64),result=await e.SESSIONS.get(e.SESSIONS.idFromName('account-authority-v2')).fetch('https://internal.invalid/',{method:'POST',body:JSON.stringify({operation:'continuation-create',handle,intent:{clientId:'synthetic',redirectUri:'https://chatgpt.com/connector/oauth/synthetic',state:'synthetic',responseType:'code',codeChallenge:'A'.repeat(43),codeChallengeMethod:'S256',resource:e.RESOURCE,scope:['repository:read']}})});
        const value=await result.json();return Response.json({handle,ref:value.ref});
      }
      return routes(r,{...e,ACCOUNT_BROWSER_SESSIONS:e.SESSIONS,ACCOUNT_GRANTS:{idFromName:()=> 'fixture',get:()=>({fetch:async request=>{
      const v=await jwtVerify(request.headers.get('Authorization').slice(7),await importJWK(JSON.parse(e.PUBLIC_KEY),'ES256'),{issuer:e.ACCOUNT_ISSUER,audience:e.BROKER_AUDIENCE});
      if(v.payload.github_id!==1001)throw new Error('identity mismatch');
      return Response.json({generation:1,status:'absent'});
    }})}},async()=>new Response('',{status:403}));}};
  `, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false, bindings: { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_ISSUER: 'https://account.example.test', ACCOUNT_LOGIN_CALLBACK: callback, ACCOUNT_SIGNING_JWK: JSON.stringify({ ...await exportJWK(key.privateKey), kid: 'fixture' }), PUBLIC_KEY: JSON.stringify(await exportJWK(key.publicKey)), SERVICE: 'navigator', RESOURCE: 'https://navigator.example.test/mcp', BROKER_AUDIENCE: 'https://broker.example.test/read' }, durableObjects: { SESSIONS: { className: 'AccountBrowserSessions', useSQLite: true } }, kvNamespaces: ['ACCOUNT_CONNECTOR_KV'] });
  try {
    let continuationCookie = '', initialCookie = '';
    if (mode !== 'standalone') {
      const created = await (await mf.dispatchFetch('https://account.example.test/fixture/continuation')).json() as { handle: string; ref: string };
      continuationCookie = '; __Host-account_continuation=' + created.ref; initialCookie = '__Host-account_browser=' + created.handle + continuationCookie;
      const continued = await mf.dispatchFetch('https://account.example.test/account/continue', { redirect: 'manual', headers: { Cookie: initialCookie } }); expect(continued.status).toBe(303); expect(continued.headers.get('Location')).toBe('/account/signin');
    }
    const signin = await mf.dispatchFetch('https://account.example.test/account/signin', { headers: { Cookie: initialCookie } }); expect(signin.status).toBe(200);
    const browserCookie = signin.headers.get('Set-Cookie')!.split(';')[0], nonce = (await signin.text()).match(/name="csrf" value="([^"]+)"/)![1];
    const start = await mf.dispatchFetch('https://account.example.test/account/signin', { method: 'POST', redirect: 'manual', headers: { Cookie: browserCookie + continuationCookie, Origin: 'https://account.example.test' }, body: new URLSearchParams({ csrf: nonce, ...(continuationCookie ? { continuation: continuationCookie.split('=')[1] } : {}) }).toString() }); expect(start.status).toBe(303);
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!, loginCookie = start.headers.get('Set-Cookie')!.split(';')[0];
    const callbackUrl = callback + '?code=synthetic&state=' + state;
    if (mode === 'connector-extra-signin-get') {
      const reread = await mf.dispatchFetch('https://account.example.test/account/signin', { headers: { Cookie: browserCookie + continuationCookie + '; ' + loginCookie } }); expect(reread.status).toBe(200); const html = await reread.text(); expect(html).toContain('GitHub sign-in is already in progress'); expect(html).toContain('action="/account/continuation/cancel"'); expect(html).not.toContain('action="/account/signin"'); expect(reread.headers.get('Set-Cookie')).toContain(browserCookie);
    }
    const completed = await mf.dispatchFetch(callbackUrl, { redirect: 'manual', headers: { Cookie: browserCookie + continuationCookie + '; ' + loginCookie } }); expect(completed.status, await completed.clone().text()).toBe(303);
    const sessionCookie = completed.headers.get('Set-Cookie')!.match(/__Host-account_session=([^;]+)/)![0];
    expect(completed.headers.get('Location')).toBe(mode === 'standalone' ? '/account' : '/account/continue');
    const returned = await mf.dispatchFetch('https://account.example.test' + completed.headers.get('Location'), { headers: { Cookie: browserCookie + continuationCookie + '; ' + sessionCookie } }); expect(returned.status, await returned.clone().text()).toBe(200); expect(await returned.text()).toContain('Repository access is not connected.');
    const account = await mf.dispatchFetch('https://account.example.test/account', { headers: { Cookie: browserCookie + continuationCookie + '; ' + sessionCookie } }); expect(account.status).toBe(200); const html = await account.text(); expect(html).toContain('Repository access is not connected.'); expect(html).not.toContain('INERT_');
    const replay = await mf.dispatchFetch(callbackUrl, { redirect: 'manual', headers: { Cookie: browserCookie + '; ' + loginCookie } }); expect(replay.status).toBe(503); expect(await replay.text()).toContain('<code>callback-transaction</code>');
  } finally { await mf.dispose(); }
}, 30_000);
