import { afterEach, expect, it, vi } from 'vitest';
import { accountWorker, connectorSession } from '../../account/broker';
import { DurableGrantStore, GrantVault } from '../../account/grants';
import { verifySession } from '../../account/session';
import { context, credential, input, mockProvider } from './helpers';
import { harness } from './worker-harness';

afterEach(() => vi.unstubAllGlobals());
async function expiredGrant() {
  const h = await harness();
  const vault = new GrantVault(new DurableGrantStore(h.storage as unknown as DurableObjectStorage), new Uint8Array(32).fill(7), context.subject);
  await vault.connect({ ...credential(), expiresAt: 0 }, 1);
  return { ...h, vault };
}
it('one connector exchange refreshes before signing and its first private read succeeds', async () => {
  const h = await expiredGrant(), provider = mockProvider();
  vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => String(url).includes('/repos/') ? h.repo.fetcher(url, init) : provider(url, init));
  const renewed = await connectorSession(h.request('/connector/session'), h.env, context);
  expect(renewed.status).toBe(200);
  const body = await renewed.json() as { assertion: string; generation: number };
  expect(await verifySession(body.assertion, h.service, h.a.policy)).toEqual({ ...context, generation: 2 });
  expect(body.generation).toBe(2);
  expect(provider).toHaveBeenCalledTimes(2); // One token exchange, one immutable identity check.
  const read = await accountWorker.fetch(h.request('/read', input, { Authorization: `Bearer ${body.assertion}` }), h.env);
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({ generation: 2, subject: context.subject, repository: { id: 2001 } });
  expect(provider).toHaveBeenCalledTimes(2);
  // The old assertion remains unusable: no auth retry or stale-generation disclosure.
  const count = h.repo.calls.length;
  expect((await accountWorker.fetch(h.request('/read', input), h.env)).status).toBe(403);
  expect(h.repo.calls).toHaveLength(count);
});
it.each(['wrong principal', 'wrong subject', 'wrong service', 'revoked', 'reconnected old consent'])('renew denies %s before provider contact', async mode => {
  const h = await expiredGrant(), provider = mockProvider();
  vi.stubGlobal('fetch', provider);
  let props = { ...context }, extra = {};
  if (mode === 'wrong principal') props.githubId = 1002;
  if (mode === 'wrong subject') props.subject = 'acct-B';
  if (mode === 'wrong service') extra = { 'X-Service-Authorization': `Bearer ${await h.a.machine({ resource: 'https://other.example.test/mcp' })}` };
  if (mode === 'revoked' || mode === 'reconnected old consent') await h.vault.revoke();
  if (mode === 'reconnected old consent') await h.vault.connect(credential(), 2);
  // Synthetic namespace deliberately returns the same object even for the wrong
  // subject, testing the persisted object ownership check as well as signatures.
  h.data.set('subject', context.subject);
  const response = await connectorSession(h.request('/connector/session', undefined, extra), h.env, props);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: 'access_denied' });
  expect(provider).not.toHaveBeenCalled();
  expect(h.repo.calls).toHaveLength(0);
});
it('refresh failure returns only denial, revokes uncertain credentials and performs no read', async () => {
  const h = await expiredGrant();
  vi.stubGlobal('fetch', mockProvider({ expires_in: undefined }));
  const response = await connectorSession(h.request('/connector/session'), h.env, context);
  expect(response.status).toBe(403);
  const body = await response.text();
  expect(body).not.toContain('INERT_');
  expect(JSON.parse(body)).toMatchObject({ error: 'access_denied' });
  expect(h.data.get('grant')).toMatchObject({ status: 'revoked' });
  expect(h.repo.calls).toHaveLength(0);
});
it('revocation while renewal refresh is in flight prevents assertion issuance', async () => {
  const h = await expiredGrant(), provider = mockProvider();
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    entered(); await wait; return provider(url, init);
  });
  const pending = connectorSession(h.request('/connector/session'), h.env, context);
  await started; await h.vault.revoke(); release();
  const response = await pending;
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: 'access_denied' });
  expect(h.data.get('grant')).toMatchObject({ status: 'revoked' });
  expect(h.repo.calls).toHaveLength(0);
});

it('concurrent renewal fails closed while refresh owns custody', async () => {
  const h = await expiredGrant(), provider = mockProvider();
  let release!: () => void, entered!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    entered(); await wait; return provider(url, init);
  });
  const first = connectorSession(h.request('/connector/session'), h.env, context);
  await started;
  const concurrent = await connectorSession(h.request('/connector/session'), h.env, context);
  expect(concurrent.status).toBe(403);
  release();
  const success = await first;
  expect(success.status).toBe(200);
  expect(await success.json()).toMatchObject({ generation: 2 });
  expect(provider).toHaveBeenCalledTimes(2);
});
it('revocation during assertion signing prevents its disclosure', async () => {
  const h = await expiredGrant();
  vi.stubGlobal('fetch', mockProvider());
  const original = crypto.subtle.sign.bind(crypto.subtle);
  let signatures = 0;
  const spy = vi.spyOn(crypto.subtle, 'sign').mockImplementation(async (...args) => {
    const result = await original(...args);
    // connectorSession signs the trusted props first; renewal signs second.
    if (++signatures === 2) await h.vault.revoke();
    return result;
  });
  try {
    const response = await connectorSession(h.request('/connector/session'), h.env, context);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'access_denied' });
    expect(h.data.get('grant')).toMatchObject({ status: 'revoked' });
  } finally { spy.mockRestore(); }
});
