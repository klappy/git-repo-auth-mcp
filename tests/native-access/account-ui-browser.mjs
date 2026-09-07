// Exact server-rendered surface proof, using synthetic identity only; not live auth acceptance.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = resolve(process.env.ACCOUNT_UI_EVIDENCE_DIR || '/tmp/account-ui-evidence'); await mkdir(out, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'account-ui-build-'));
await build({ entryPoints: ['account/account-ui.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'ui.mjs') });
const { accountPage, consentPage, browserHeaders } = await import(pathToFileURL(join(temp, 'ui.mjs')).href);
const server = createServer((req, res) => { res.writeHead(200, { ...browserHeaders(), 'Content-Type': 'text/html' }); res.end(req.url === '/consent' ? consentPage({client:'Synthetic connector',resource:'https://navigator.example.test/mcp',csrf:'synthetic-csrf',authorizationUrl:'https://account.example.test/authorize'}) : accountPage(req.url?.startsWith('/synthetic') ? { subject: 'Synthetic account A', csrf: 'synthetic-csrf', connected: req.url === '/synthetic-connected' } : {})); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const chromiumRuntime = process.env.CHROMIUM_ARGS_MODULE ? await import(process.env.CHROMIUM_ARGS_MODULE) : undefined;
const browserArgs = chromiumRuntime ? (chromiumRuntime.default.default ?? chromiumRuntime.default).args : ['--no-sandbox'];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE, args: browserArgs }); const receipts = [];
try {
  const context = await browser.newContext(); const page = await context.newPage(); let external = 0;
  await page.route('**/*', route => { if (route.request().url().startsWith(base)) return route.continue(); external++; return route.abort(); });
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    for (const [state, path] of [['unavailable', '/'], ['synthetic-account', '/synthetic'], ['connected-account', '/synthetic-connected'], ['connector-consent', '/consent']]) {
      const response = await page.goto(base + path); await page.screenshot({ path: join(out, `${name}-${state}.png`), fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('horizontal overflow');
      if (response.headers()['cache-control'] !== 'private, no-store') throw Error('cache contract failed');
      if (await page.locator('script').count()) throw Error('unexpected script');
      if (state === 'unavailable' && !await page.getByRole('button', { name: 'Sign in with GitHub' }).isDisabled()) throw Error('unavailable login was enabled');
      await page.keyboard.press('Tab');
      receipts.push({ viewport: name, state, title: await page.title(), focus: await page.evaluate(() => document.activeElement?.tagName), localStorageKeys: await page.evaluate(() => Object.keys(localStorage)), externalRequests: external });
    }
  }
  await writeFile(join(out, 'browser-receipt.json'), JSON.stringify({ scope: 'Exact account HTML/CSS, synthetic identity fixture; no login/session/provider flow claim', receipts }, null, 2));
} finally { await browser.close(); await new Promise(r => server.close(r)); await rm(temp, { recursive: true, force: true }); }
