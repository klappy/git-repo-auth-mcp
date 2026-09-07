import { it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import worker from '../../account/broker';
import type { AccountEnv } from '../../account/broker';
import { accountPage } from '../../account/account-ui';
it('production account login stays unavailable; opaque/public pages and all errors bypass caches', async () => {
  const env = { ACCOUNT_ISSUER: 'https://account.example.test', PRIVATE_ACTIVATION: 'disabled' } as AccountEnv;
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  for (const path of ['/account', '/account/signin', '/account/public']) {
    const response = await worker.fetch(new Request('https://account.example.test' + path), env, ctx);
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Set-Cookie')).toBeNull(); expect(await response.text()).not.toMatch(/access_token|refresh_token|localStorage|<script/);
  }
  for (const path of ['/account/signin', '/account/callback?code=INERT_CODE', '/account/disconnect']) {
    const response = await worker.fetch(new Request('https://account.example.test' + path, { method: path.includes('callback') ? 'GET' : 'POST', headers: { Origin: 'https://evil.invalid' }, ...(path.includes('callback') ? {} : { body: 'subject=forged&githubId=1001&csrf=forged' }) }), env, ctx);
    expect(response.status).toBe(503); expect(response.headers.get('Set-Cookie')).toBeNull(); expect(response.headers.get('Cache-Control')).toBe('private, no-store'); expect(await response.text()).not.toContain('INERT_');
  }
  const html = accountPage({ subject: '<script>unsafe</script>', csrf: '" autofocus', connected: false });
  expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain('<script>'); expect(html).toContain('upstream writes');
  const denied = await worker.fetch(new Request('https://account.example.test/internal/bootstrap', { method: 'POST' }), env, ctx); expect(denied.status).toBe(403);
});
