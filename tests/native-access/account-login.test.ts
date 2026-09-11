import { it, expect, vi } from 'vitest';
import { productionLogin } from '../../account/login';
const callback = 'https://account.example.test/account/callback';
function fixture(scope: unknown = 'read:user', id: unknown = 1001, extra: Record<string, unknown> = {}) {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (url, init) => { requests.push(String(url)); expect(init?.redirect).toBe('manual'); return String(url).endsWith('/user') ? Response.json({ id, login: 'display-only', email: 'collision@example.test' }, { headers: { 'x-oauth-scopes': typeof scope === 'string' ? scope : '' } }) : Response.json({ access_token: 'INERT_IDENTITY_ACCESS', refresh_token: 'INERT_IDENTITY_REFRESH', token_type: 'bearer', scope, ...extra }); };
  const adapter = productionLogin({ clientId: 'synthetic', clientSecret: 'INERT_CLIENT', callback, fetch: fetcher });
  return { adapter, requests };
}
it('maintained GitHub bootstrap requests exact read:user/S256 and returns only fresh numeric identity, never either credential', async () => {
  const { adapter, requests } = fixture(), start = await adapter.begin(), target = new URL(start.url);
  expect(target.origin + target.pathname).toBe('https://github.com/login/oauth/authorize'); expect(target.searchParams.get('scope')).toBe('read:user'); expect(target.searchParams.get('code_challenge_method')).toBe('S256'); expect(start.url).not.toContain(start.transaction.verifier);
  const result = await adapter.complete({ url: new URL(callback + '?code=synthetic&state=' + start.transaction.state), transaction: start.transaction });
  expect(result).toEqual({ githubId: 1001 }); expect(JSON.stringify(result)).not.toMatch(/INERT|access|refresh/); expect(requests).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user']);
});
it.each([undefined, null, '', ' ', ',read:user', 'read:user,', 'repo', 'user', 'user:email', 'offline_access', 'read:user repo', 'read:user unknown', ['read:user']])('rejects missing, malformed or broader identity scopes %j', async scope => {
  const { adapter } = fixture(scope === undefined ? null : scope), start = await adapter.begin();
  await expect(adapter.complete({ url: new URL(callback + '?code=x&state=' + start.transaction.state), transaction: start.transaction })).rejects.toThrow();
});
it.each([0, -1, '1001', null, 1.5])('rejects nonnumeric or invalid provider ID %j', async id => { const { adapter } = fixture('read:user', id), start = await adapter.begin(); await expect(adapter.complete({ url: new URL(callback + '?code=x&state=' + start.transaction.state), transaction: start.transaction })).rejects.toThrow(); });
it('rejects wrong state, callback, purpose, expiration and provider denial before exchange', async () => {
  const { adapter, requests } = fixture(), start = await adapter.begin();
  for (const url of [callback + '?code=x&state=wrong', 'https://other.example.test/account/callback?code=x&state=' + start.transaction.state, callback + '?error=access_denied&state=' + start.transaction.state]) await expect(adapter.complete({ url: new URL(url), transaction: start.transaction })).rejects.toThrow();
  await expect(adapter.complete({ url: new URL(callback + '?code=x&state=' + start.transaction.state), transaction: { ...start.transaction, expiresAt: Date.now() - 1 } })).rejects.toThrow(); expect(requests).toEqual([]);
});
it.each([301, 302, 303, 307, 308])('rejects provider redirect %s without second destination', async status => {
  const calls: string[] = [], adapter = productionLogin({ clientId: 'x', clientSecret: 'INERT_CLIENT', callback, fetch: async url => { calls.push(String(url)); return new Response('INERT_REDIRECT', { status, headers: { Location: 'https://evil.example.test/?access=INERT' } }); } }), start = await adapter.begin();
  await expect(adapter.complete({ url: new URL(callback + '?code=x&state=' + start.transaction.state), transaction: start.transaction })).rejects.toThrow(); expect(calls).toHaveLength(1);
});
it('bounds response size and provider timeout', async () => {
  for (const mode of ['oversize', 'timeout']) {
    const adapter = productionLogin({ clientId: 'x', clientSecret: 'INERT_CLIENT', callback, fetch: async (_url, init) => mode === 'oversize' ? new Response('x'.repeat(65537)) : new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
    const start = await adapter.begin(); if (mode === 'timeout') vi.useFakeTimers();
    const result = adapter.complete({ url: new URL(callback + '?code=x&state=' + start.transaction.state), transaction: start.transaction }); const rejected = expect(result).rejects.toThrow();
    if (mode === 'timeout') await vi.advanceTimersByTimeAsync(5001); await rejected; vi.useRealTimers();
  }
});
