import { CompactEncrypt, compactDecrypt } from 'jose';
import { AccessDenied } from './session';
import { validateIdentity, type AccountIdentity } from './identity-registry';
export interface ManagedTokens { access_token: string; refresh_token: string; expires_at: number; user: { id: string }; }
export interface BrowserSession { identity: AccountIdentity; managed: ManagedTokens; createdAt: number; verifiedAt: number; idleUntil: number; absoluteUntil: number; generation: number; browser: string; browserHandle: string; csrf: string; status: 'active' | 'refreshing'; repositoryState?: { state: string; expiresAt: number }; }
interface Pending { browser: string; browserHandle: string; nonce: string; expiresAt: number; verifier?: string; started?: boolean; generation: number; }
export function opaque() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join(''); }
export function projectManaged(value: unknown): ManagedTokens {
  const v = value as Partial<ManagedTokens>;
  if (!v || typeof v.access_token !== 'string' || !v.access_token || typeof v.refresh_token !== 'string' || !v.refresh_token || !Number.isSafeInteger(v.expires_at) || !v.user || typeof v.user.id !== 'string' || !v.user.id) throw new AccessDenied();
  return { access_token: v.access_token, refresh_token: v.refresh_token, expires_at: v.expires_at!, user: { id: v.user.id } };
}
export class BrowserSessions {
  constructor(private storage: DurableObjectStorage, private key: Uint8Array) { if (key.length !== 32) throw new AccessDenied(); }
  private async seal(value: unknown) { return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value))).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'account-browser+jwe' }).encrypt(this.key); }
  private async open<T>(value: string): Promise<T> { return JSON.parse(new TextDecoder().decode((await compactDecrypt(value, this.key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })).plaintext)); }
  async begin(browser: string) {
    if (!/^[a-f0-9]{64}$/.test(browser)) throw new AccessDenied();
    const browserHash = await hash(browser);
    return this.storage.transaction(async tx => {
      const ledger = await tx.get<{ generation: number; active?: string }>('browser:' + browserHash) ?? { generation: 0 };
      ledger.generation++;
      const pending: Pending = { browser: browserHash, browserHandle: browser, nonce: opaque(), expiresAt: Date.now() + 300_000, generation: ledger.generation };
      await tx.put('browser:' + browserHash, ledger);
      await tx.put('pending:' + browserHash, await this.seal(pending));
      return { nonce: pending.nonce, expiresAt: pending.expiresAt };
    });
  }
  async verifier(browser: string, nonce: string, verifier?: string) {
    const key = 'pending:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const encrypted = await tx.get<string>(key); if (!encrypted) throw new AccessDenied();
      const p = await this.open<Pending>(encrypted); if (p.nonce !== nonce || p.expiresAt <= Date.now()) throw new AccessDenied();
      if (verifier !== undefined) { if (!verifier || verifier.length > 512) throw new AccessDenied(); p.verifier = verifier; await tx.put(key, await this.seal(p)); }
      return p.verifier ?? null;
    });
  }
  async start(browser: string, nonce: string) {
    const key = 'pending:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied();
      const pending = await this.open<Pending>(raw);
      if (pending.nonce !== nonce || pending.expiresAt <= Date.now() || pending.started) throw new AccessDenied();
      pending.started = true; await tx.put(key, await this.seal(pending)); return { started: true };
    });
  }
  async consume(browser: string, nonce: string) {
    const key = 'pending:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const encrypted = await tx.get<string>(key); if (!encrypted) throw new AccessDenied();
      const p = await this.open<Pending>(encrypted);
      if (!p.started || p.nonce !== nonce || p.browser !== await hash(browser) || p.expiresAt <= Date.now()) throw new AccessDenied();
      const ledger = await tx.get<{ generation: number }>('browser:' + p.browser);
      if (ledger?.generation !== p.generation) throw new AccessDenied();
      const proof = opaque(); await tx.delete(key);
      await tx.put('activation:' + await hash(proof), await this.seal(p));
      return { verifier: p.verifier, proof };
    });
  }
  async activate(identity: AccountIdentity, value: unknown, proof: string) {
    validateIdentity(identity); const managed = projectManaged(value);
    if (managed.user.id !== identity.subject || managed.expires_at * 1000 <= Date.now() || !/^[a-f0-9]{64}$/.test(proof)) throw new AccessDenied();
    const handle = opaque(), sessionKey = 'session:' + await hash(handle), proofKey = 'activation:' + await hash(proof);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(proofKey); if (!raw) throw new AccessDenied();
      const pending = await this.open<Pending>(raw), ledgerKey = 'browser:' + pending.browser;
      const ledger = await tx.get<{ generation: number; active?: string }>(ledgerKey);
      if (!ledger || ledger.generation !== pending.generation || pending.expiresAt <= Date.now()) throw new AccessDenied();
      const now = Date.now();
      const session: BrowserSession = { identity, managed, browser: pending.browser, browserHandle: pending.browserHandle, createdAt: now, verifiedAt: now, idleUntil: now + 1_800_000, absoluteUntil: now + 28_800_000, generation: 1, csrf: opaque(), status: 'active' };
      if (ledger.active) {
        const previous = await tx.get<string>(ledger.active);
        if (previous) { const old = await this.open<BrowserSession>(previous); await tx.put(ledger.active, await this.seal({ status: 'retired', browser: old.browser, csrf: old.csrf, absoluteUntil: old.absoluteUntil })); }
      }
      ledger.active = sessionKey; await tx.delete(proofKey); await tx.put(ledgerKey, ledger); await tx.put(sessionKey, await this.seal(session));
      return { handle, csrf: session.csrf };
    });
  }
  async load(handle: string) {
    if (!/^[a-f0-9]{64}$/.test(handle)) throw new AccessDenied();
    const value = await this.storage.get<string>('session:' + await hash(handle)); if (!value) throw new AccessDenied();
    const session = await this.open<BrowserSession>(value), now = Date.now();
    if (session.status !== 'active' || session.idleUntil <= now || session.absoluteUntil <= now || session.managed.expires_at * 1000 <= now) throw new AccessDenied();
    return session;
  }
  async csrf(handle: string, nonce: string) {
    const key = 'session:' + await hash(handle);
    return this.storage.transaction(async tx => {
      const value = await tx.get<string>(key); if (!value) throw new AccessDenied();
      const s = await this.open<BrowserSession>(value), now = Date.now();
      if (s.status !== 'active' || s.csrf !== nonce || s.idleUntil <= now || s.absoluteUntil <= now || s.managed.expires_at * 1000 <= now) throw new AccessDenied();
      s.csrf = opaque(); await tx.put(key, await this.seal(s)); return s;
    });
  }
  async repositoryCallback(handle: string, state: string, consume = false) {
    if (!state || state.length > 256) throw new AccessDenied();
    const key = 'session:' + await hash(handle);
    return this.storage.transaction(async tx => {
      const value = await tx.get<string>(key); if (!value) throw new AccessDenied();
      const s = await this.open<BrowserSession>(value);
      if (s.status !== 'active' || s.absoluteUntil <= Date.now() || s.idleUntil <= Date.now()) throw new AccessDenied();
      if (consume) { if (s.repositoryState?.state !== state || s.repositoryState.expiresAt <= Date.now()) throw new AccessDenied(); delete s.repositoryState; }
      else s.repositoryState = { state, expiresAt: Date.now() + 300_000 };
      await tx.put(key, await this.seal(s)); return { accepted: true };
    });
  }
  async touch(handle: string) {
    const key = 'session:' + await hash(handle);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const s = await this.open<BrowserSession>(raw), now = Date.now();
      if (s.status !== 'active' || s.idleUntil <= now || s.absoluteUntil <= now || s.managed.expires_at * 1000 <= now) throw new AccessDenied();
      s.idleUntil = Math.min(now + 1_800_000, s.absoluteUntil); s.verifiedAt = now;
      await tx.put(key, await this.seal(s)); return s;
    });
  }
  /** Origin is checked by the route; consume CSRF and retire browser authority atomically. */
  async signout(handle: string, nonce: string) {
    const key = 'session:' + await hash(handle);
    await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied();
      const s = await this.open<{ browser: string; csrf: string; absoluteUntil: number }>(raw);
      if (s.csrf !== nonce || s.absoluteUntil <= Date.now()) throw new AccessDenied();
      const ledgerKey = 'browser:' + s.browser, ledger = await tx.get<{ generation: number; active?: string }>(ledgerKey);
      if (!ledger) throw new AccessDenied();
      if (ledger.active) await tx.delete(ledger.active);
      ledger.generation++; delete ledger.active;
      await tx.put(ledgerKey, ledger); await tx.delete('pending:' + s.browser); await tx.delete(key);
    });
  }
  async invalidate(handle: string) {
    const key = 'session:' + await hash(handle);
    await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) return;
      const s = await this.open<BrowserSession>(raw), ledgerKey = 'browser:' + s.browser;
      const ledger = await tx.get<{ generation: number; active?: string }>(ledgerKey);
      if (ledger?.active === key) { ledger.generation++; delete ledger.active; await tx.put(ledgerKey, ledger); await tx.delete('pending:' + s.browser); }
      await tx.delete(key);
    });
  }
  /** Serialize refresh intent before provider IO. A crash leaves refreshing, never a reusable pair. */
  async refresh(handle: string, exchange: (old: ManagedTokens) => Promise<{ managed: ManagedTokens; identity: AccountIdentity }>) {
    const key = 'session:' + await hash(handle);
    const old = await this.storage.transaction(async tx => { const value = await tx.get<string>(key); if (!value) throw new AccessDenied(); const s = await this.open<BrowserSession>(value); if (s.status !== 'active' || s.absoluteUntil <= Date.now() || s.idleUntil <= Date.now()) throw new AccessDenied(); s.status = 'refreshing'; await tx.put(key, await this.seal(s)); return s; });
    try {
      const next = await exchange(old.managed), managed = projectManaged(next.managed);
      if (next.identity.subject !== old.identity.subject || next.identity.githubId !== old.identity.githubId || managed.user.id !== old.identity.subject || managed.refresh_token === old.managed.refresh_token || managed.expires_at * 1000 <= Date.now()) throw new AccessDenied();
      return await this.storage.transaction(async tx => { const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const current = await this.open<BrowserSession>(raw); if (current.status !== 'refreshing' || current.generation !== old.generation || current.absoluteUntil <= Date.now()) throw new AccessDenied(); const s = { ...old, managed, status: 'active' as const, generation: old.generation + 1, verifiedAt: Date.now(), idleUntil: Math.min(Date.now() + 1_800_000, old.absoluteUntil), csrf: opaque() }; await tx.put(key, await this.seal(s)); return s; });
    } catch { await this.invalidate(handle); throw new AccessDenied(); }
  }
}
export interface BrowserEnv { BROWSER_SESSION_KEY_HEX: string; }
/** Internal binding only; no public request routing to arbitrary commands. */
export class AccountBrowserSessions implements DurableObject {
  constructor(private state: DurableObjectState, private env: BrowserEnv) {}
  async fetch(request: Request) {
    try {
      if (request.method !== 'POST' || !/^[a-f0-9]{64}$/.test(this.env.BROWSER_SESSION_KEY_HEX)) throw new AccessDenied();
      const store = new BrowserSessions(this.state.storage, Uint8Array.from(this.env.BROWSER_SESSION_KEY_HEX.match(/../g)!, n => parseInt(n, 16)));
      const b = await request.json() as { operation: string; handle: string; nonce: string; identity: AccountIdentity; managed: ManagedTokens; consume?: boolean; proof: string };
      if (b.operation === 'begin') return Response.json(await store.begin(b.handle));
      if (b.operation === 'start') return Response.json(await store.start(b.handle, b.nonce));
      if (b.operation === 'pending') return Response.json({ verifier: await store.verifier(b.handle, b.nonce) });
      if (b.operation === 'consume') return Response.json(await store.consume(b.handle, b.nonce));
      if (b.operation === 'activate') return Response.json(await store.activate(b.identity, b.managed, b.proof));
      if (b.operation === 'repository-state') return Response.json(await store.repositoryCallback(b.handle, b.nonce, b.consume));
      if (b.operation === 'touch') return Response.json(await store.touch(b.handle));
      if (b.operation === 'load') return Response.json(await store.load(b.handle));
      if (b.operation === 'csrf') return Response.json(await store.csrf(b.handle, b.nonce));
      if (b.operation === 'signout') { await store.signout(b.handle, b.nonce); return Response.json({ invalidated: true }); }
      if (b.operation === 'invalidate') { await store.invalidate(b.handle); return Response.json({ invalidated: true }); }
      throw new AccessDenied();
    } catch { return Response.json({ error: 'access_denied' }, { status: 403 }); }
  }
}
