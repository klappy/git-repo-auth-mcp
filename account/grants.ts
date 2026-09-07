import { CompactEncrypt, compactDecrypt } from 'jose';
import { AccessDenied } from './session';
import type { GitHubOAuth, OAuthTransaction, ProviderCredential, TransactionStore } from './oauth';

export interface GrantRecord { generation: number; epoch: number; status: 'verified' | 'refreshing' | 'revoked'; encrypted?: string; }
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
  async revoke() {
    for (;;) {
      const old = await this.store.get();
      const generation = (old?.generation ?? 1) + 1;
      if (await this.store.compareAndSwap(old?.generation, { generation, epoch: generation, status: 'revoked' }, old?.status)) return generation;
    }
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
