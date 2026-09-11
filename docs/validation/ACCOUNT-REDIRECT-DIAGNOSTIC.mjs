// Run from the account repository: node ../ACCOUNT-REDIRECT-DIAGNOSTIC.mjs
// Uses installed dependencies only. Every non-runtime network destination is mocked or denied.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('package.json'));
const { Miniflare } = require('miniflare');
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher } = require('undici');
const previous = getGlobalDispatcher(), mock = new MockAgent();
mock.disableNetConnect();
let hits = 0;
mock.get('https://github.com').intercept({ path: '/login/oauth/authorize', method: 'GET' }).reply(() => {
  hits++;
  return { statusCode: 200, data: 'SYNTHETIC_REDIRECT_DESTINATION' };
});
setGlobalDispatcher(mock);
const mf = new Miniflare({ modules: true, script: 'export default{fetch(){return Response.redirect("https://github.com/login/oauth/authorize",303)}}', compatibilityDate: '2026-06-16', host: '127.0.0.1', port: 0, cf: false });
try {
  const followed = await mf.dispatchFetch('https://fixture.invalid/start', { method: 'POST' });
  const body = await followed.text();
  const inspected = await mf.dispatchFetch('https://fixture.invalid/start', { method: 'POST', redirect: 'manual' });
  await inspected.text();
  const result = { defaultStatus: followed.status, defaultBody: body, manualStatus: inspected.status, manualLocation: inspected.headers.get('location'), mockGlobalHits: hits, unmockedExternalNetwork: 'disabled' };
  if (result.defaultStatus !== 200 || body !== 'SYNTHETIC_REDIRECT_DESTINATION' || result.manualStatus !== 303 || result.manualLocation !== 'https://github.com/login/oauth/authorize' || hits !== 1) throw new Error('Redirect diagnostic assertion failed');
  console.log(JSON.stringify(result));
} finally {
  await mf.dispose();
  setGlobalDispatcher(previous);
  await mock.close();
}
