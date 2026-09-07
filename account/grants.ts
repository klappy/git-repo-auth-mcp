import { CompactEncrypt, compactDecrypt } from 'jose';
import { AccessDenied } from './session';
import type { GitHubOAuth, OAuthTransaction, ProviderCredential, TransactionStore } from './oauth';

export interface GrantRecord { generation: number; epoch: number; status: 'verified' | 'refreshing' | 'revoked'; encrypted?: string; }
export interface BrowserGrantProof { handle: string; generation: number; accountEpoch: number; subject: string; githubId: number; }
interface GrantCandidate { id: string; browser: BrowserGrantProof; expiresAt: number; expected: number | undefined; expectedStatus?: GrantRecord['status']; next: GrantRecord; }
export interface AtomicStore {
  get(): Promise<GrantRecord | undefined>;
  compareAndSwap(expected: number | undefined, next: GrantRecord, expectedStatus?: GrantRecord['status']): Promise<boolean>;
}
export class GrantVault {
  private flight?: Promise<{ credential: ProviderCredential; generation: number }>;
  constructor(private store: AtomicStore, private key: Uint8Array, private subject: string) {
    if (key.byteLength !== 32) throw new AccessDenied();
  }
  private async encrypt(credential: ProviderCredential, generation: number) {
    return new CompactEncrypt(new TextEncoder().encode(JSON.stringify({ credential, subject: this.subject, generation }))).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'account-grant+jwe' }).encrypt(this.key);
  }
  private async decrypt(record: GrantRecord): Promise<ProviderCredential> {
    if (!record.encrypted) throw new AccessDenied();
    const { plaintext } = await compactDecrypt(record.encrypted, this.key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] });
    const body = JSON.parse(new TextDecoder().decode(plaintext));
    if (body.subject !== this.subject || body.generation !== record.generation) throw new AccessDenied();
    return body.credential;
  }
  async connect(credential: ProviderCredential, expectedGeneration: number) {
    const prior = await this.store.get();
    // Initial account assertion uses generation 1. A reconnect must match the persisted revoked/current generation.
    if ((prior?.generation ?? 1) !== expectedGeneration || prior?.status === 'refreshing') throw new AccessDenied();
    const generation = prior ? prior.generation + 1 : 1;
    if (!await this.store.compareAndSwap(prior?.generation, { generation, epoch: generation, status: 'verified', encrypted: await this.encrypt(credential, generation) }, prior?.status)) throw new AccessDenied();
    return generation;
  }
  async prepare(credential: ProviderCredential, expectedGeneration: number, browser: BrowserGrantProof, storage: DurableObjectStorage) {
    if (browser.subject !== this.subject || browser.githubId !== credential.githubId || !/^[a-f0-9]{64}$/.test(browser.handle) || !Number.isSafeInteger(browser.generation) || browser.generation < 1 || !Number.isSafeInteger(browser.accountEpoch) || browser.accountEpoch < 0) throw new AccessDenied();
    const prior = await this.store.get();
    if ((prior?.generation ?? 1) !== expectedGeneration || prior?.status === 'refreshing') throw new AccessDenied();
    const generation = prior ? prior.generation + 1 : 1, id = crypto.randomUUID();
    const candidate: GrantCandidate = { id, browser, expiresAt: Date.now() + 300_000, expected: prior?.generation, expectedStatus: prior?.status, next: { generation, epoch: generation, status: 'verified', encrypted: await this.encrypt(credential, generation) } };
    // Separate staging key is never read by credential(), bootstrap(), current() or generation().
    await storage.put('grant-candidate', await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(candidate))).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'account-grant-candidate+jwe' }).encrypt(this.key));
    return { candidateId: id, subject: this.subject };
  }
  async commitCandidate(id: string, browser: BrowserGrantProof, storage: DurableObjectStorage) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AccessDenied();
    const result = await storage.transaction(async tx => {
      const key = 'grant-candidate', raw = await tx.get<string>(key);
      if (!raw) return undefined;
      const { plaintext, protectedHeader } = await compactDecrypt(raw, this.key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] });
      if (protectedHeader.typ !== 'account-grant-candidate+jwe') return undefined;
      const candidate = JSON.parse(new TextDecoder().decode(plaintext)) as GrantCandidate;
      if (candidate.id !== id) return undefined;
      await tx.delete(key); // Burn this exact candidate; a stale id cannot delete its replacement.
      const old = await tx.get<GrantRecord>('grant');
      if (candidate.id !== id || candidate.expiresAt <= Date.now() || candidate.browser.subject !== this.subject || JSON.stringify(candidate.browser) !== JSON.stringify(browser) || old?.generation !== candidate.expected || old?.status !== candidate.expectedStatus) return undefined;
      if ((await this.decrypt(candidate.next)).githubId !== browser.githubId) return undefined;
      await tx.put('grant', candidate.next); return candidate.next.generation;
    });
    if (result === undefined) throw new AccessDenied(); return result;
  }
  async revoke() {
    for (;;) {
      const old = await this.store.get();
      const generation = (old?.generation ?? 1) + 1;
      if (await this.store.compareAndSwap(old?.generation, { generation, epoch: generation, status: 'revoked' }, old?.status)) return generation;
    }
  }
  /** Called only after independent immutable identity verification on the same subject. */
  async bootstrap(expectedId: number) {
    const record = await this.store.get();
    if (!record) return { generation: 1, status: 'absent' as const };
    if (record.status === 'refreshing') throw new AccessDenied();
    if (record.status === 'verified' && (await this.decrypt(record)).githubId !== expectedId) throw new AccessDenied();
    return { generation: record.generation, status: record.status };
  }
  async generation(expectedId: number, assertionGeneration: number) {
    const record = await this.store.get();
    if (!record || record.status !== 'verified' || assertionGeneration < record.epoch || assertionGeneration > record.generation || (await this.decrypt(record)).githubId !== expectedId) throw new AccessDenied();
    return record.generation;
  }
  async current(generation: number) {
    const record = await this.store.get();
    if (!record || record.status !== 'verified' || record.generation !== generation) throw new AccessDenied();
  }
  async credential(expectedGeneration: number, expectedId: number, provider: GitHubOAuth) {
    const old = await this.store.get();
    if (!old || old.generation !== expectedGeneration || old.status === 'revoked') throw new AccessDenied();
    if (this.flight) return this.flight.then(result => { if (result.credential.githubId !== expectedId) throw new AccessDenied(); return result; });
    if (old.status !== 'verified') throw new AccessDenied(); // An uncertain prior process's refresh requires reconnect.
    const credential = await this.decrypt(old);
    if (credential.githubId !== expectedId) throw new AccessDenied();
    if (this.flight) return this.flight;
    if (credential.expiresAt > Date.now() + 30_000) return { credential, generation: old.generation };
    // No await between flight installation and later callers observing it.
    this.flight = this.rotate(old, credential, provider).finally(() => { this.flight = undefined; });
    return this.flight;
  }
  private async rotate(old: GrantRecord, credential: ProviderCredential, provider: GitHubOAuth) {
    if (!await this.store.compareAndSwap(old.generation, { ...old, status: 'refreshing' }, 'verified')) throw new AccessDenied();
    try {
      const next = await provider.refresh(credential), generation = old.generation + 1;
      if (!await this.store.compareAndSwap(old.generation, { generation, epoch: old.epoch, status: 'verified', encrypted: await this.encrypt(next, generation) }, 'refreshing')) throw new AccessDenied();
      return { credential: next, generation };
    } catch {
      await this.store.compareAndSwap(old.generation, { generation: old.generation + 1, epoch: old.generation + 1, status: 'revoked' }, 'refreshing');
      throw new AccessDenied();
    }
  }
}

/** A single subject Durable Object owns this adapter; transactions enforce compare-and-swap across interleaved requests. */
export class DurableGrantStore implements AtomicStore, TransactionStore {
  constructor(private storage: DurableObjectStorage) {}
  get() { return this.storage.get<GrantRecord>('grant'); }
  compareAndSwap(expected: number | undefined, next: GrantRecord, expectedStatus?: GrantRecord['status']) {
    return this.storage.transaction(async tx => {
      const current = await tx.get<GrantRecord>('grant');
      if (current?.generation !== expected || (expectedStatus !== undefined && current?.status !== expectedStatus)) return false;
      await tx.put('grant', next); return true;
    });
  }
  async put(transaction: OAuthTransaction) { await this.storage.put('oauth-pending', transaction); }
  take(state: string) {
    return this.storage.transaction(async tx => {
      const key = 'oauth-pending', result = await tx.get<OAuthTransaction>(key);
      if (result?.state !== state) return undefined;
      await tx.delete(key); return result;
    });
  }
}
