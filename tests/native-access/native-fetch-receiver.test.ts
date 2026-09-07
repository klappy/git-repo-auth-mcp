import { it, expect } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, createFetchMock, fetch as hostFetch, type Request as HostRequest } from 'miniflare';

// Native global fetch is deliberately never replaced inside this Worker. Miniflare
// intercepts requests outside its invocation boundary, preserving receiver checks.
const script = `
import { GitHubReads } from './account/upstream';
import { GitHubOAuth } from './account/oauth';
import { AccountBroker } from './account/broker';
const context={subject:'acct-A',githubId:1001,generation:1,service:'navigator',resource:'https://navigator.example.test/mcp'};
const credential={accessToken:'INERT_ACCESS',refreshToken:'INERT_REFRESH',expiresAt:Date.now()+3600000,refreshExpiresAt:Date.now()+7200000,scopes:['repo'],githubId:1001};
export default { async fetch(request) {
  const reads=new GitHubReads(fetch);
  const oauth=new GitHubOAuth({clientId:'synthetic-client',clientSecret:'INERT_CLIENT_SECRET',callback:'https://account.example.test/oauth/callback',fetch});
  const path=new URL(request.url).pathname;
  try {
    if(path==='/oauth') {
      let pending;
      const store={put:async tx=>{pending=tx},take:async state=>{const tx=pending;pending=undefined;return tx?.state===state?tx:undefined}};
      const start=new URL(await oauth.start(context,'repository',store));
      const callback=new URL('https://account.example.test/oauth/callback');callback.search=new URLSearchParams({state:start.searchParams.get('state'),code:'INERT_CODE'}).toString();
      const result=await oauth.callback(callback,context,store);
      return Response.json({githubId:result.credential.githubId,scopes:result.credential.scopes,generation:result.generation});
    }
    if(path==='/refresh') { const result=await oauth.refresh(credential);return Response.json({githubId:result.githubId,scopes:result.scopes,rotated:result.refreshToken!==credential.refreshToken}); }
    const input={requestId:'native-receiver',resource:context.resource,action:path==='/forbidden'?'write_blob':path==='/redirect'?'read_archive':path==='/leak'?'read_blob':'resolve_repository',repository:{id:2001,owner:'personal',name:'same-name'},...(path==='/leak'?{path:'secret.txt'}:{})};
    const vault={credential:async()=>({credential,generation:1}),current:async()=>{}};
    const result=await new AccountBroker(vault,oauth,reads).read(input,context);
    return Response.json(result);
  } catch(error) { return Response.json({error:error.message==='access_denied'?'access_denied':error.message.includes('Illegal invocation')?'illegal_invocation':error.message.includes('redirect')?'unsupported_redirect':'unexpected_failure'},{status:403}); }
} };
`;
async function runtime(mode: 'normal' | 'wrong-id' | 'wrong-scope' | 'user-redirect' | 'token-redirect' = 'normal', redirectStatus = 302) {
  const output = await build({ stdin: { contents: script, resolveDir: process.cwd(), sourcefile: 'native-receiver-fixture.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'] });
  const mock = createFetchMock(); mock.disableNetConnect();
  const counts = { token: 0, identity: 0, repository: 0, commit: 0, archive: 0, blob: 0, escaped: 0 };
  mock.get('https://github.com').intercept({ path: '/login/oauth/access_token', method: 'POST' }).reply(() => {
    counts.token++;
    if (mode === 'token-redirect') return { statusCode: redirectStatus, data: 'INERT_PROVIDER_BODY', responseOptions: { headers: { location: 'https://escape.example.test/redirect?secret=INERT_HEADER' } } };
    return { statusCode: 200, data: JSON.stringify({ access_token: 'INERT_NEW_ACCESS', refresh_token: 'INERT_NEW_REFRESH', token_type: 'bearer', scope: mode === 'wrong-scope' ? 'read:user' : 'repo', expires_in: 3600, refresh_token_expires_in: 7200 }), responseOptions: { headers: { 'content-type': 'application/json' } } };
  }).persist();
  const api = mock.get('https://api.github.com');
  api.intercept({ path: '/user', method: 'GET' }).reply(() => { counts.identity++; if (mode === 'user-redirect') return { statusCode: redirectStatus, data: 'INERT_PROVIDER_BODY', responseOptions: { headers: { location: 'https://escape.example.test/redirect?secret=INERT_HEADER' } } }; return { statusCode: 200, data: JSON.stringify({ id: mode === 'wrong-id' ? 9999 : 1001 }), responseOptions: { headers: { 'content-type': 'application/json', 'x-oauth-scopes': 'repo' } } }; }).persist();
  api.intercept({ path: '/repos/personal/same-name', method: 'GET' }).reply(() => { counts.repository++; return { statusCode: 200, data: JSON.stringify({ id: 2001, full_name: 'personal/same-name', default_branch: 'main', private: true }) }; }).persist();
  api.intercept({ path: '/repos/personal/same-name/commits/main', method: 'GET' }).reply(() => { counts.commit++; return { statusCode: 200, data: JSON.stringify({ sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } }) }; }).persist();
  api.intercept({ path: '/repos/personal/same-name/tarball/' + 'a'.repeat(40), method: 'GET' }).reply(() => { counts.archive++; return { statusCode: 302, data: '', responseOptions: { headers: { location: 'https://codeload.github.com/other/repo/legacy.tar.gz/' + 'a'.repeat(40) } } }; }).persist();
  api.intercept({ path: '/repos/personal/same-name/contents/secret.txt?ref=' + 'a'.repeat(40), method: 'GET' }).reply(() => { counts.blob++; return { statusCode: 200, data: JSON.stringify({ type: 'file', encoding: 'base64', content: Buffer.from('INERT_ACCESS').toString('base64'), path: 'secret.txt', sha: 'c'.repeat(40) }) }; }).persist();
  mock.get('https://escape.example.test').intercept({ path: /./, method: /./ }).reply(() => { counts.escaped++; return { statusCode: 200, data: 'INERT_ESCAPED' }; }).persist();
  // The external mock bridge must return redirects verbatim. Its own fetch default
  // would follow before workerd could exercise the production redirect policy.
  const mf = new Miniflare({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-06-16', compatibilityFlags: ['nodejs_compat'], host: '127.0.0.1', port: 0, cf: false, outboundService: (request: HostRequest) => hostFetch(request, { dispatcher: mock, redirect: 'manual' }) });
  return { mf, counts, close: async () => { await mf.dispose(); await mock.close(); } };
}
it('actual workerd native fetch survives receiving read/OAuth constructors and maintained code/refresh calls', async () => {
  const h = await runtime();
  try {
    for (const path of ['/read', '/oauth', '/refresh']) { const response = await h.mf.dispatchFetch('https://fixture.example.test' + path); const body = await response.text(); expect(response.status, path + ':' + body).toBe(200); expect(body).not.toContain('INERT_'); }
    expect(h.counts).toEqual({ token: 2, identity: 2, repository: 1, commit: 1, archive: 0, blob: 0, escaped: 0 });
    for (const path of ['/forbidden', '/redirect', '/leak']) { const response = await h.mf.dispatchFetch('https://fixture.example.test' + path); expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'access_denied' }); }
    expect(h.counts.archive).toBe(1); expect(h.counts.blob).toBe(1);
  } finally { await h.close(); }
}, 30_000);
it('native OAuth transport preserves wrong numeric identity and scope denials in code and refresh paths', async () => {
  for (const mode of ['wrong-id', 'wrong-scope'] as const) {
    const h = await runtime(mode);
    try { for (const path of ['/oauth', '/refresh']) { const response = await h.mf.dispatchFetch('https://fixture.example.test' + path); expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'access_denied' }); } expect(h.counts.token).toBe(2); expect(h.counts.identity).toBe(mode === 'wrong-id' ? 2 : 0); }
    finally { await h.close(); }
  }
}, 30_000);

it('actual native OAuth transport rejects every redirect status without a second destination or credential output', async () => {
  for (const status of [301, 302, 303, 307, 308]) for (const mode of ['user-redirect', 'token-redirect'] as const) {
    const h = await runtime(mode, status);
    try {
      for (const path of ['/oauth', '/refresh']) {
        const response = await h.mf.dispatchFetch('https://fixture.example.test' + path);
        expect(response.status).toBe(403);
        const text = await response.text(); expect(text).not.toMatch(/INERT_|illegal_invocation|unsupported_redirect/);
        if (mode === 'user-redirect') expect(JSON.parse(text)).toEqual({ error: 'access_denied' });
      }
      expect(h.counts.escaped, mode + ':' + status).toBe(0); expect(h.counts.token).toBe(2); expect(h.counts.identity).toBe(mode === 'user-redirect' ? 2 : 0);
    } finally { await h.close(); }
  }
}, 30_000);
