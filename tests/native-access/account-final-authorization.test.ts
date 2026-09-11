import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import { BrowserSessions, AccountBrowserSessions } from '../../account/browser-session';
import { DurableGrantStore, GrantVault, type BrowserGrantProof } from '../../account/grants';
import { createAccountRoutes } from '../../account/account-routes';
import worker from '../../account/broker';
import { accountWorker } from '../../account/broker';
import { credential, context } from './helpers';
import { harness } from './worker-harness';

class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(key: string | Record<string, unknown>, value?: unknown) { if (typeof key === 'string') this.data.set(key, structuredClone(value)); else for (const [k, v] of Object.entries(key)) this.data.set(k, structuredClone(v)); }
  async delete(key: string) { return this.data.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>; }
  async transaction<T>(fn: (tx: DurableObjectTransaction) => Promise<T>) { const old = new Map(this.data); try { return await fn(this as unknown as DurableObjectTransaction); } catch (error) { this.data = old; throw error; } }
  durable() { return this as unknown as DurableObjectStorage; }
}
async function authority() {
  const storage = new Storage(), sessions = new BrowserSessions(storage.durable(), new Uint8Array(32).fill(0xab));
  const issue = async (browser = 'a'.repeat(64), activeHandle?: string) => {
    const p = await sessions.begin(browser, activeHandle);
    const transaction = { kind: 'identity-bootstrap' as const, state: crypto.randomUUID(), verifier: 'INERT_VERIFIER', callback: 'https://fixture.invalid/account/callback', expiresAt: Date.now() + 300000 };
    await sessions.start(browser, p.nonce, transaction);
    return sessions.activate(1001, (await sessions.consume(browser, p.nonce, transaction.state)).proof);
  };
  return { storage, sessions, issue };
}
const proof: BrowserGrantProof = { handle: 'b'.repeat(64), generation: 1, accountEpoch: 0, subject: context.subject, githubId: 1001 };
it('encrypted prepared grant is not usable; restart exact commit is one-use and preserves consent generation', async () => {
  const storage = new Storage(), vault = new GrantVault(new DurableGrantStore(storage.durable()), new Uint8Array(32).fill(7), context.subject);
  await vault.connect(credential(), 1); const before = await storage.get('grant');
  const candidate = await vault.prepare({ ...credential(), accessToken: 'INERT_REPLACEMENT' }, 1, proof, storage.durable());
  expect(await storage.get('grant')).toEqual(before);
  expect(JSON.stringify([...storage.data.values()])).not.toMatch(/INERT|bbbbbbbb/);
  const restarted = new GrantVault(new DurableGrantStore(storage.durable()), new Uint8Array(32).fill(7), context.subject);
  expect(await restarted.commitCandidate(candidate.candidateId, proof, storage.durable())).toBe(2);
  await expect(restarted.commitCandidate(candidate.candidateId, proof, storage.durable())).rejects.toThrow();
  expect(await storage.get('grant-candidate')).toBeUndefined();
});
it('candidate wrong epoch, expiry, replaced id and concurrent grant disconnect cannot overwrite existing grant', async () => {
  const storage = new Storage(), vault = new GrantVault(new DurableGrantStore(storage.durable()), new Uint8Array(32).fill(7), context.subject);
  await vault.connect(credential(), 1); const before = await storage.get('grant');
  const first = await vault.prepare(credential(), 1, proof, storage.durable());
  const second = await vault.prepare(credential(), 1, proof, storage.durable());
  await expect(vault.commitCandidate(first.candidateId, proof, storage.durable())).rejects.toThrow();
  expect(await storage.get('grant-candidate')).toBeTruthy();
  await expect(vault.commitCandidate(second.candidateId, { ...proof, accountEpoch: 1 }, storage.durable())).rejects.toThrow();
  expect(await storage.get('grant')).toEqual(before);
  const expired = await vault.prepare(credential(), 1, proof, storage.durable());
  vi.useFakeTimers(); try { vi.setSystemTime(Date.now() + 300001); await expect(vault.commitCandidate(expired.candidateId, proof, storage.durable())).rejects.toThrow(); } finally { vi.useRealTimers(); }
  const stale = await vault.prepare(credential(), 1, proof, storage.durable()); await vault.revoke(); const revoked = await storage.get('grant');
  await expect(vault.commitCandidate(stale.candidateId, proof, storage.durable())).rejects.toThrow(); expect(await storage.get('grant')).toEqual(revoked);
});
it('browser final gate denies signout during prepared provider interval and stale freshness before any internal commit', async () => {
  const a = await authority(), active = await a.issue(), s = await a.sessions.load(active.handle);
  const p = { handle: active.handle, generation: s.generation, accountEpoch: s.accountEpoch, subject: s.identity.subject, githubId: s.identity.githubId };
  const commit = vi.fn(async () => Response.json({ generation: 2 }));
  const state = { storage: a.storage.durable(), blockConcurrencyWhile: async (fn: () => Promise<Response>) => fn() } as unknown as DurableObjectState;
  const env = { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32), PRIVATE_ACTIVATION: 'owner-verified', ACCOUNT_GRANTS: { idFromName: (s: string) => s, get: () => ({ fetch: commit }) } };
  const object = new AccountBrowserSessions(state, env);
  const final = () => object.fetch(new Request('https://internal.invalid/', { method: 'POST', body: JSON.stringify({ operation: 'commit-repository', handle: active.handle, proof: p, candidateId: crypto.randomUUID(), assertion: 'INERT_ASSERTION' }) }));
  vi.useFakeTimers(); try { vi.setSystemTime(Date.now() + 300001); expect((await final()).status).toBe(403); expect(commit).not.toHaveBeenCalled(); } finally { vi.useRealTimers(); }
  await a.sessions.signout(active.handle, active.csrf);
  expect((await final()).status).toBe(403); expect(commit).not.toHaveBeenCalled();
});
it('local signout does not access grant authority; route accepts retired CSRF tombstone', async () => {
  const a = await authority(), old = await a.issue(), next = await a.issue('a'.repeat(64), old.handle);
  const object = new AccountBrowserSessions({ storage: a.storage.durable() } as unknown as DurableObjectState, { BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) });
  const namespace = { idFromName: (s: string) => s, get: () => ({ fetch: (url: string, init: RequestInit) => object.fetch(new Request(url, init)) }) } as unknown as DurableObjectNamespace;
  const routes = createAccountRoutes(), h = await harness();
  const response = await routes(new Request(h.env.ACCOUNT_ISSUER + '/account/signout', { method: 'POST', headers: { Origin: h.env.ACCOUNT_ISSUER, Cookie: '__Host-account_session=' + old.handle }, body: new URLSearchParams({ csrf: old.csrf }).toString() }), { ...h.env, ACCOUNT_BROWSER_SESSIONS: namespace }, async () => { throw new Error('Signout must not access grant broker'); });
  expect(response!.status).toBe(303); await expect(a.sessions.load(next.handle)).rejects.toThrow();
});
it('matched-nonce invalid state burns only that flow; orphaned forward and malformed reverse restore deny reassignment', async () => {
  const a = await authority(), pending = await a.sessions.begin('c'.repeat(64));
  const transaction = { kind: 'identity-bootstrap' as const, state: 'right', verifier: 'INERT_VERIFIER', callback: 'https://fixture.invalid/account/callback', expiresAt: Date.now() + 300000 };
  await a.sessions.start('c'.repeat(64), pending.nonce, transaction);
  await expect(a.sessions.consume('c'.repeat(64), 'wrong-nonce', 'right')).rejects.toThrow();
  await expect(a.sessions.consume('c'.repeat(64), pending.nonce, 'wrong-state')).rejects.toThrow();
  await expect(a.sessions.consume('c'.repeat(64), pending.nonce, 'right')).rejects.toThrow();
  const active = await a.issue(), identity = (await a.sessions.load(active.handle)).identity;
  await a.storage.delete('identity:v2:https://github.com:1001');
  await expect(a.issue('d'.repeat(64))).rejects.toThrow();
  expect(await a.storage.get('identity:v2:subject:' + identity.subject)).toBe(1001);
  await a.storage.put('identity:v2:https://github.com:1001', ''); await expect(a.issue('e'.repeat(64))).rejects.toThrow();
});
it('public raw OAuth routes reject even a valid signed broker assertion and forged browser proof', async () => {
  const h = await harness(), ctx = { waitUntil() {} } as unknown as ExecutionContext;
  for (const path of ['/oauth/start?purpose=repository', '/oauth/callback?state=forged&code=forged', '/internal/grant/commit']) {
    const response = await worker.fetch(h.request(path, {}, { 'X-Account-Browser-Proof': JSON.stringify(proof) }), h.env, ctx);
    expect(response.status).toBe(403);
  }
});

it('real browser route signout during paused provider exchange leaves prior encrypted grant and generation unchanged', async () => {
  const a = await authority(), active = await a.issue(), session = await a.sessions.load(active.handle), h = await harness();
  const vault = new GrantVault(new DurableGrantStore(h.storage as unknown as DurableObjectStorage), new Uint8Array(32).fill(7), session.identity.subject);
  await vault.connect(credential(), 1); const before = structuredClone(h.data.get('grant'));
  const env = { ...h.env, BROWSER_SESSION_KEY_HEX: 'ab'.repeat(32) };
  const object = new AccountBrowserSessions({ storage: a.storage.durable(), blockConcurrencyWhile: async (fn: () => Promise<Response>) => fn() } as unknown as DurableObjectState, env);
  h.env.ACCOUNT_BROWSER_SESSIONS = { idFromName: (s: string) => s, get: () => ({ fetch: (url: string, init: RequestInit) => object.fetch(new Request(url, init)) }) } as unknown as DurableObjectNamespace;
  const routes = createAccountRoutes(), headers = { Cookie: '__Host-account_session=' + active.handle, Origin: h.env.ACCOUNT_ISSUER };
  const send = (request: Request) => routes(request, h.env, r => accountWorker.fetch(r, h.env));
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/login/oauth/access_token')) { entered(); await paused; }
    return h.transport(input, init);
  });
  try {
    const connect = await send(new Request(h.env.ACCOUNT_ISSUER + '/account/repositories/connect', { method: 'POST', headers, body: new URLSearchParams({ csrf: active.csrf, purpose: 'account' }).toString() }));
    expect(connect!.status).toBe(303);
    const state = new URL(connect!.headers.get('Location')!).searchParams.get('state')!;
    const pending = send(new Request(h.env.GITHUB_CALLBACK + '?code=synthetic&state=' + state, { headers }));
    await started;
    const current = await a.sessions.load(active.handle);
    const signout = await send(new Request(h.env.ACCOUNT_ISSUER + '/account/signout', { method: 'POST', headers, body: new URLSearchParams({ csrf: current.csrf }).toString() }));
    expect(signout!.status).toBe(303); release();
    expect((await pending)!.status).toBe(503);
    expect(h.data.get('grant')).toEqual(before);
    expect(JSON.stringify(h.data.get('grant-candidate'))).not.toMatch(/INERT|handle/);
  } finally { release(); vi.unstubAllGlobals(); }
});
