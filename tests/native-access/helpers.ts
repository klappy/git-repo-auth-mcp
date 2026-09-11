import { generateKeyPair, SignJWT } from 'jose';
import { vi } from 'vitest';
import type { SessionContext, SessionPolicy } from '../../account/session';
import { GrantVault, type AtomicStore, type GrantRecord } from '../../account/grants';
import { GitHubOAuth, type OAuthTransaction, type ProviderCredential, type TransactionStore } from '../../account/oauth';
import { AccountBroker, type BrokerReadRequest } from '../../account/broker';
import { GitHubReads } from '../../account/upstream';
import fixtures from './fixtures/identity-repositories.json';
export const SHA = 'a'.repeat(40), TREE = 'b'.repeat(40);
export const context: SessionContext = { subject: 'acct-A', githubId: 1001, generation: 1, service: 'navigator', resource: 'https://navigator.example.test/mcp' };
export const input: BrokerReadRequest = { requestId: 'request-1', resource: context.resource, action: 'read_blob', repository: { id: 2001, owner: 'personal', name: 'same-name' }, path: 'docs/cookbook.md' };
export const credential = (id = 1001): ProviderCredential => ({ accessToken: `INERT_ACCESS_${id}`, refreshToken: `INERT_REFRESH_${id}`, expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 7_200_000, githubId: id, scopes: ['repo'] });
export class MemoryStore implements AtomicStore, TransactionStore {
  record?: GrantRecord; states = new Map<string, OAuthTransaction>();
  async get() { return this.record && structuredClone(this.record); }
  async compareAndSwap(expected: number | undefined, next: GrantRecord, status?: GrantRecord['status']) {
    if (this.record?.generation !== expected || (status !== undefined && this.record?.status !== status)) return false;
    this.record = structuredClone(next); return true;
  }
  async put(tx: OAuthTransaction) { this.states.set(tx.state, structuredClone(tx)); }
  async take(state: string) { const tx = this.states.get(state); this.states.delete(state); return tx; }
}
export function provider(fetcher: typeof fetch) { return new GitHubOAuth({ clientId: 'synthetic-client', clientSecret: 'INERT_CLIENT_SECRET', callback: 'https://account.example.test/oauth/callback', fetch: fetcher }); }
export function mockProvider(overrides: Record<string,unknown> = {}, id = 1001, scopeHeader = 'repo') {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === 'https://api.github.com/user') return Response.json({ id }, { headers: { 'x-oauth-scopes': scopeHeader } });
    return Response.json({ access_token: 'INERT_NEW_ACCESS', token_type: 'bearer', scope: 'repo', expires_in: 3600, refresh_token: 'INERT_NEW_REFRESH', refresh_token_expires_in: 7200, ...overrides });
  }) as unknown as ReturnType<typeof vi.fn> & typeof fetch;
}
export function repositoryTransport() {
  const calls: { url: string; method: string; authorization: string }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const text = String(url), headers = new Headers(init?.headers), authorization = headers.get('authorization') ?? '';
    calls.push({ url: text, method: init?.method ?? 'GET', authorization });
    const repo = fixtures.repositories.find(r => text.startsWith(`https://api.github.com/repos/${r.owner}/${r.name}`));
    const uid = authorization.endsWith('1002') ? 1002 : 1001;
    const user = fixtures.users.find(u => u.githubId === uid)!;
    if (!repo || !user.repositories.includes(repo.id)) return Response.json({ error: 'not_found' }, { status: 404 });
    if (text.includes('/commits/')) return Response.json({ sha: SHA, commit: { tree: { sha: TREE } } });
    if (text.includes('/git/trees/')) return Response.json({ sha: TREE, tree: [{ path: repo.path, sha: 'c'.repeat(40) }], truncated: false });
    if (text.includes('/contents/')) return Response.json({ type: 'file', content: btoa(repo.marker), encoding: 'base64', path: repo.path, sha: 'c'.repeat(40) });
    return Response.json({ id: repo.id, full_name: `${repo.owner}/${repo.name}`, default_branch: repo.defaultBranch, private: true });
  }) as typeof fetch;
  return { fetcher, calls };
}
export async function setup(id = 1001) {
  const store = new MemoryStore(), vault = new GrantVault(store, new Uint8Array(32).fill(7), id === 1001 ? 'acct-A' : 'acct-B');
  await vault.connect(credential(id), 1);
  const transport = repositoryTransport(), oauth = provider(mockProvider({}, id));
  return { store, vault, oauth, ...transport, broker: new AccountBroker(vault, oauth, new GitHubReads(transport.fetcher)) };
}
export async function assertions() {
  const account = await generateKeyPair('ES256', { extractable: true }), service = await generateKeyPair('ES256', { extractable: true });
  const policy: SessionPolicy = { accountIssuer: 'https://account.example.test', serviceIssuer: 'https://service.example.test', audience: 'https://broker.example.test/read', resource: context.resource, service: context.service, accountKey: account.publicKey, serviceKey: service.publicKey };
  const user = (changes: Record<string,unknown> = {}) => new SignJWT({ github_id: 1001, service: context.service, resource: context.resource, grant_generation: 1, ...changes }).setProtectedHeader({ alg: 'ES256' }).setSubject('acct-A').setIssuer(policy.accountIssuer).setAudience(policy.audience).setIssuedAt().setExpirationTime('5m').sign(account.privateKey);
  const machine = (changes: Record<string,unknown> = {}) => new SignJWT({ resource: context.resource, ...changes }).setProtectedHeader({ alg: 'ES256' }).setSubject(context.service).setIssuer(policy.serviceIssuer).setAudience(policy.audience).setIssuedAt().setExpirationTime('5m').sign(service.privateKey);
  return { user, machine, policy, account, service };
}
