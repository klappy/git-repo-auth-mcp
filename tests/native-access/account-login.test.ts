import { it, expect } from 'vitest';
import { managedSdk, QuarantinedSdkStorage, productionLogin } from '../../account/login';
it('pinned SDK quarantines initial and refreshed provider fields before storage writes and never selects production login', async () => {
  const writes = new Map<string, string>();
  const storage = new QuarantinedSdkStorage({ getItem: key => writes.get(key) ?? null, setItem: (key, value) => { writes.set(key, value); }, removeItem: key => { writes.delete(key); } });
  const user = { id: 'managed-A', aud: 'authenticated', app_metadata: { provider: 'github' }, user_metadata: { leaked: 'INERT_METADATA' }, identities: [], created_at: new Date().toISOString() };
  const sdk = managedSdk('https://fixture.supabase.invalid', 'synthetic-publishable', storage, async (url) => {
    if (String(url).includes('/user')) return Response.json(user);
    return Response.json({ access_token: 'managed-access', refresh_token: 'managed-refresh', token_type: 'bearer', expires_in: 3600, provider_token: 'ANY_PROVIDER_CREDENTIAL', provider_refresh_token: 'OTHER_PROVIDER_REFRESH', user });
  });
  const start = await sdk.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: 'https://account.example.test/account/callback', scopes: 'read:user', skipBrowserRedirect: true } }); expect(start.error).toBeNull(); expect(writes.size).toBeGreaterThan(0);
  const exchange = await sdk.auth.exchangeCodeForSession('synthetic-code'); expect(exchange.error).toBeNull();
  expect((await sdk.auth.getUser(exchange.data.session!.access_token)).error).toBeNull();
  expect((await sdk.auth.refreshSession({ refresh_token: exchange.data.session!.refresh_token })).error).toBeNull();
  expect([...writes.values()].join('')).not.toMatch(/PROVIDER|managed-access|managed-refresh|INERT_METADATA/);
  const staged = await storage.getItem('account-managed'); expect(staged).not.toMatch(/PROVIDER|INERT_METADATA/); expect(staged).toContain('managed-access');
  storage.discard(); await expect(productionLogin.begin({browser:'x',nonce:'x'})).rejects.toThrow(); await expect(productionLogin.complete({code:'x'})).rejects.toThrow();
  sdk.auth.stopAutoRefresh();
});
