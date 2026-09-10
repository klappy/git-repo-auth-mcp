// CI-only synthetic browser regression. No live account, provider, or credentials.
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
const receipts = [];
let base;
const server = createServer((req, res) => {
  const url = new URL(req.url, base);
  const targets = { provider: 'https://github.com/synthetic-only', callback: 'https://client.example.test/callback', denied: 'https://evil.example.test/callback' };
  if (req.method === 'POST' && url.pathname === '/redirect') { res.writeHead(303, { ...browserHeaders(), Location: targets[url.searchParams.get('target')] }); res.end(); return; }
  if (req.method === 'POST') {
    const accepted = req.headers.origin === base;
    receipts.push({ kind: 'form', policy: url.searchParams.get('policy'), origin: req.headers.origin ?? null, accepted });
    res.writeHead(accepted ? 200 : 403, { 'Content-Type': 'text/html' });
    res.end('<h1>' + (accepted ? 'Origin accepted' : 'Origin rejected') + '</h1>'); return;
  }
  const headers = browserHeaders(url.searchParams.get('target') === 'callback' ? targets.callback : undefined); if (url.searchParams.get('policy') === 'old') headers['Referrer-Policy'] = 'no-referrer';
  res.writeHead(200, { ...headers, 'Content-Type': 'text/html' });
  if (url.pathname === '/redirect-form') { res.end('<form method="post" action="/redirect?target=' + url.searchParams.get('target') + '"><button>Synthetic redirect</button></form>'); return; }
  res.end(accountPage({ loginCsrf: 'SYNTHETIC_NONCE' }).replace('action="/account/signin"', 'action="/account/signin?policy=' + url.searchParams.get('policy') + '"') + '<a href="https://github.com/synthetic-only">Synthetic external navigation</a>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); let externalReferer; const externalRequests = [];
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    externalRequests.push(route.request().url());
    if (['https://github.com/synthetic-only', 'https://client.example.test/callback'].includes(route.request().url())) { externalReferer = route.request().headers().referer ?? null; return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Synthetic external destination</h1>' }); }
    return route.abort();
  });
  for (const policy of ['old', 'new']) {
    await page.goto(base + '/?policy=' + policy);
    await Promise.all([page.waitForURL('**/account/signin?policy=' + policy), page.getByRole('button', { name: 'Sign in with GitHub' }).click()]);
    assert.equal(await page.locator('h1').textContent(), policy === 'old' ? 'Origin rejected' : 'Origin accepted');
  }
  assert.equal(receipts[0].origin, 'null'); assert.equal(receipts[1].origin, base);
  await page.goto(base + '/?policy=new');
  await page.getByRole('link', { name: 'Synthetic external navigation' }).click();
  await page.waitForURL('https://github.com/synthetic-only'); assert.equal(externalReferer, null);
  const redirectReceipts = [];
  for (const [kind, destination] of [['provider', 'https://github.com/synthetic-only'], ['callback', 'https://client.example.test/callback']]) {
    await page.goto(base + '/redirect-form?target=' + kind);
    await Promise.all([page.waitForURL(destination), page.getByRole('button', { name: 'Synthetic redirect' }).click()]);
    assert.equal(page.url(), destination); assert.equal(externalReferer, null);
    redirectReceipts.push({ kind, reached: true, referer: externalReferer });
  }
  await page.goto(base + '/redirect-form?target=denied');
  const violation = page.waitForEvent('console', { predicate: msg => msg.text().includes('form-action') });
  await page.getByRole('button', { name: 'Synthetic redirect' }).click({ noWaitAfter: true }); await violation;
  assert.equal(externalRequests.includes('https://evil.example.test/callback'), false);
  console.log(JSON.stringify({ redirectReceipts, unregisteredRedirectBlocked: true }));
  console.log(JSON.stringify({ scope: 'synthetic native browser forms only', receipts, externalReferer }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); }
