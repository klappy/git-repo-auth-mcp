// CI-only native browser regression. All navigation destinations are local.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const temp = await mkdtemp(join(tmpdir(), 'account-form-'));
await build({ entryPoints: ['account/account-ui.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'ui.mjs') });
const { browserHeaders, accountPage } = await import(pathToFileURL(join(temp, 'ui.mjs')).href);
const receipts = [], destinationReceipts = [], servers = [];
const listen = async handler => { const server = createServer(handler); servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return 'http://127.0.0.1:' + server.address().port; };
const destination = kind => (req, res) => { destinationReceipts.push({ kind, referer: req.headers.referer ?? null }); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>Local synthetic ' + kind + '</h1>'); };
const provider = await listen(destination('provider')), callback = await listen(destination('callback'));
const targets = { provider: provider + '/provider', callback: callback + '/callback', denied: 'http://127.0.0.1:9/denied' };
// Only substitute the fixed provider origin in the test. Unit/route tests assert
// the exact production GitHub token and registered callback policy separately.
const headersFor = registered => { const headers = browserHeaders(registered); assert.ok(headers['Content-Security-Policy'].includes("form-action 'self' https://github.com")); headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace('https://github.com', provider); return headers; };
let base;
base = await listen((req, res) => {
  const url = new URL(req.url, base);
  if (req.method === 'POST' && url.pathname === '/redirect') { res.writeHead(303, { ...headersFor(), Location: targets[url.searchParams.get('target')] }); res.end(); return; }
  if (req.method === 'POST') {
    const accepted = req.headers.origin === base;
    receipts.push({ kind: 'form', policy: url.searchParams.get('policy'), origin: req.headers.origin ?? null, accepted });
    res.writeHead(accepted ? 200 : 403, { 'Content-Type': 'text/html' }); res.end('<h1>' + (accepted ? 'Origin accepted' : 'Origin rejected') + '</h1>'); return;
  }
  const headers = headersFor(url.searchParams.get('target') === 'callback' ? targets.callback : undefined);
  if (url.searchParams.get('policy') === 'old') headers['Referrer-Policy'] = 'no-referrer';
  res.writeHead(200, { ...headers, 'Content-Type': 'text/html' });
  if (url.pathname === '/redirect-form') { res.end('<form method="post" action="/redirect?target=' + url.searchParams.get('target') + '"><button>Synthetic redirect</button></form>'); return; }
  res.end(accountPage({ loginCsrf: 'SYNTHETIC_NONCE' }).replace('action="/account/signin"', 'action="/account/signin?policy=' + url.searchParams.get('policy') + '"'));
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(10000); const requests = [];
  page.on('request', request => requests.push(request.url()));
  // No redirect can leave localhost: every server-generated Location is fixed
  // above. Routing is defense in depth, not the redirect isolation mechanism.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const policy of ['old', 'new']) {
    await page.goto(base + '/?policy=' + policy);
    await Promise.all([page.waitForURL('**/account/signin?policy=' + policy), page.getByRole('button', { name: 'Sign in with GitHub' }).click()]);
    assert.equal(await page.locator('h1').textContent(), policy === 'old' ? 'Origin rejected' : 'Origin accepted');
  }
  assert.equal(receipts[0].origin, 'null'); assert.equal(receipts[1].origin, base);
  for (const kind of ['provider', 'callback']) {
    await page.goto(base + '/redirect-form?target=' + kind);
    await Promise.all([page.waitForURL(targets[kind]), page.getByRole('button', { name: 'Synthetic redirect' }).click()]);
    assert.equal(page.url(), targets[kind]);
  }
  assert.deepEqual(destinationReceipts, [{ kind: 'provider', referer: null }, { kind: 'callback', referer: null }]);
  await page.goto(base + '/redirect-form?target=denied');
  const violation = page.waitForEvent('console', { predicate: msg => msg.text().includes('form-action') });
  await page.getByRole('button', { name: 'Synthetic redirect' }).click({ noWaitAfter: true }); await violation;
  assert.equal(requests.includes(targets.denied), false);
  assert.ok(requests.every(url => new URL(url).hostname === '127.0.0.1'));
  console.log(JSON.stringify({ scope: 'local native browser form and redirect semantics; test-only provider origin substitution', receipts, destinationReceipts, unregisteredRedirectBlocked: true }));
} finally { await browser.close(); for (const server of servers) await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); }
