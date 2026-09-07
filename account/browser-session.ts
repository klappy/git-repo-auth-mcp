import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';
import { AccessDenied } from './session';
import { resolveIdentity, verifyIdentity, type AccountIdentity } from './identity-registry';
import type { IdentityTransaction } from './oauth';
import type { BrowserGrantProof } from './grants';
import type { AccountEnv } from './broker';
export interface BrowserSession { version: 2; identity: AccountIdentity; createdAt: number; verifiedAt: number; idleUntil: number; absoluteUntil: number; generation: number; accountEpoch: number; browser: string; browserHandle: string; csrf: string; status: 'active'; repositoryState?: { state: string; expiresAt: number }; }
interface Ledger { generation: number; active?: string; pendingNonce?: string; }
interface Epoch { generation: number; revokedAtSequence: number; }
interface Pending { version: 2; browser: string; browserHandle: string; nonce: string; expiresAt: number; generation: number; sequence: number; expected?: AccountIdentity; expectedEpoch?: number; transaction?: IdentityTransaction; }
export function opaque() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join(''); }
const handleShape = (value: string) => { if (!/^[a-f0-9]{64}$/.test(value)) throw new AccessDenied(); };
/** One authoritative DO owns identity indexes, pending transactions, session records and epochs. */
export class BrowserSessions {
  constructor(private storage: DurableObjectStorage, private key: Uint8Array, private keyId = 'browser-v2', private previous: { id: string; key: Uint8Array; notAfter: number }[] = []) {
    if (key.length !== 32 || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || previous.length > 2 || previous.some(p => p.key.length !== 32 || p.id === keyId || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id) || !Number.isSafeInteger(p.notAfter) || p.notAfter > Date.now() + 28_800_000) || new Set(previous.map(p => p.id)).size !== previous.length) throw new AccessDenied();
  }
  private async seal(value: unknown) { return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value))).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'account-browser-v2+jwe', kid: this.keyId }).encrypt(this.key); }
  private async open<T>(value: string): Promise<T> {
    const header = decodeProtectedHeader(value), old = this.previous.find(p => p.id === header.kid && p.notAfter > Date.now());
    const key = header.kid === this.keyId ? this.key : old?.key; if (!key || header.typ !== 'account-browser-v2+jwe') throw new AccessDenied();
    const result = await compactDecrypt(value, key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] }); return JSON.parse(new TextDecoder().decode(result.plaintext));
  }
  private async epoch(tx: DurableObjectTransaction, subject: string): Promise<Epoch> { return await tx.get<Epoch>('epoch:v2:' + subject) ?? { generation: 0, revokedAtSequence: 0 }; }
  private async valid(tx: DurableObjectTransaction, handle: string) {
    handleShape(handle); const key = 'session:v2:' + await hash(handle), raw = await tx.get<string>(key); if (!raw) throw new AccessDenied();
    const s = await this.open<BrowserSession>(raw), now = Date.now();
    if (s.version !== 2 || s.status !== 'active' || s.idleUntil <= now || s.absoluteUntil <= now || s.createdAt > now || s.absoluteUntil > s.createdAt + 28_800_000 || 'managed' in s) throw new AccessDenied();
    await verifyIdentity(tx, s.identity);
    const ledger = await tx.get<Ledger>('browser:v2:' + s.browser), epoch = await this.epoch(tx, s.identity.subject);
    if (ledger?.active !== key || ledger.generation !== s.generation || epoch.generation !== s.accountEpoch) throw new AccessDenied();
    return { key, session: s };
  }
  async begin(browser: string, activeHandle?: string) {
    handleShape(browser);
    return this.storage.transaction(async tx => {
      let active: BrowserSession | undefined;
      if (activeHandle) { active = (await this.valid(tx, activeHandle)).session; browser = active.browserHandle; }
      const browserHash = await hash(browser), ledgerKey = 'browser:v2:' + browserHash;
      const ledger = await tx.get<Ledger>(ledgerKey) ?? { generation: 0 };
      // Starting reauthentication does not retire the current session; a nonce is a separate lease.
      const pending: Pending = { version: 2, browser: browserHash, browserHandle: browser, nonce: opaque(), expiresAt: Date.now() + 300_000, generation: ledger.generation, sequence: await tx.get<number>('revocation-sequence:v2') ?? 0, ...(active ? { expected: active.identity, expectedEpoch: active.accountEpoch } : {}) };
      for (const [limitKey, limit] of [['attempt:v2:' + browserHash, 10], ['attempt:v2:global', 1000]] as const) {
        const window = Math.floor(Date.now() / 60000), counter = await tx.get<{ window: number; count: number }>(limitKey);
        const count = counter?.window === window ? counter.count + 1 : 1; if (count > limit) throw new AccessDenied(); await tx.put(limitKey, { window, count });
      }
      ledger.pendingNonce = pending.nonce;
      await tx.put(ledgerKey, ledger); await tx.put('pending:v2:' + browserHash, await this.seal(pending));
      return { nonce: pending.nonce, expiresAt: pending.expiresAt, browserHandle: browser };
    });
  }
  async start(browser: string, nonce: string, transaction: IdentityTransaction) {
    handleShape(browser); const key = 'pending:v2:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      if (p.version !== 2 || p.nonce !== nonce || p.expiresAt <= Date.now() || p.transaction || transaction.kind !== 'identity-bootstrap' || transaction.expiresAt <= Date.now()) throw new AccessDenied();
      if ((await tx.get<Ledger>('browser:v2:' + p.browser))?.generation !== p.generation) throw new AccessDenied();
      p.transaction = { ...transaction, expiresAt: Math.min(p.expiresAt, transaction.expiresAt) }; await tx.put(key, await this.seal(p)); return { started: true };
    });
  }
  async consume(browser: string, nonce: string, state: string) {
    handleShape(browser); const key = 'pending:v2:' + await hash(browser);
    const result = await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      if (p.nonce !== nonce) throw new AccessDenied(); // Unknown browser nonce cannot cancel another flow.
      await tx.delete(key);
      if (p.version !== 2 || p.expiresAt <= Date.now() || !p.transaction || p.transaction.state !== state || (await tx.get<Ledger>('browser:v2:' + p.browser))?.generation !== p.generation) return undefined;
      const proof = opaque(); const transaction = p.transaction; delete p.transaction;
      await tx.delete(key); await tx.put('activation:v2:' + await hash(proof), await this.seal(p));
      return { transaction, proof };
    });
    if (!result) throw new AccessDenied(); return result;
  }
  async discard(proof: string) { handleShape(proof); await this.storage.delete('activation:v2:' + await hash(proof)); }
  async activate(githubId: number, proof: string) {
    handleShape(proof); const handle = opaque(), key = 'session:v2:' + await hash(handle), proofKey = 'activation:v2:' + await hash(proof);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(proofKey); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      const ledgerKey = 'browser:v2:' + p.browser, ledger = await tx.get<Ledger>(ledgerKey);
      if (p.version !== 2 || !ledger || ledger.generation !== p.generation || ledger.pendingNonce !== p.nonce || p.expiresAt <= Date.now()) throw new AccessDenied();
      const identity = await resolveIdentity(tx, githubId), epoch = await this.epoch(tx, identity.subject);
      if (epoch.revokedAtSequence > p.sequence || (p.expected && (p.expected.subject !== identity.subject || p.expected.githubId !== githubId || p.expectedEpoch !== epoch.generation))) throw new AccessDenied();
      if (ledger.active) { const oldRaw = await tx.get<string>(ledger.active); if (oldRaw) { const old = await this.open<BrowserSession>(oldRaw); await tx.put(ledger.active, await this.seal({ version: 2, status: 'retired', browser: old.browser, csrf: old.csrf, absoluteUntil: old.absoluteUntil })); } }
      ledger.generation++; ledger.active = key; delete ledger.pendingNonce; const now = Date.now();
      const session: BrowserSession = { version: 2, identity, createdAt: now, verifiedAt: now, idleUntil: now + 1_800_000, absoluteUntil: now + 28_800_000, generation: ledger.generation, accountEpoch: epoch.generation, browser: p.browser, browserHandle: p.browserHandle, csrf: opaque(), status: 'active' };
      await tx.delete(proofKey); await tx.put(ledgerKey, ledger); await tx.put(key, await this.seal(session)); return { handle, csrf: session.csrf };
    }).catch(async error => { await this.storage.delete(proofKey); throw error; });
  }
  async load(handle: string) { return this.storage.transaction(async tx => (await this.valid(tx, handle)).session); }
  async verify(identity: AccountIdentity) { return this.storage.transaction(async tx => { await verifyIdentity(tx, identity); return identity; }); }
  async csrf(handle: string, nonce: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); if (session.csrf !== nonce) throw new AccessDenied(); session.csrf = opaque(); await tx.put(key, await this.seal(session)); return session; }); }
  async touch(handle: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); session.idleUntil = Math.min(Date.now() + 1_800_000, session.absoluteUntil); await tx.put(key, await this.seal(session)); return session; }); }
  async repositoryCallback(handle: string, state: string, consume = false) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); if (!state || state.length > 256) throw new AccessDenied(); if (consume) { if (session.repositoryState?.state !== state || session.repositoryState.expiresAt <= Date.now()) throw new AccessDenied(); delete session.repositoryState; } else { if (Date.now() - session.verifiedAt > 300_000) throw new AccessDenied(); session.repositoryState = { state, expiresAt: Date.now() + 300_000 }; } await tx.put(key, await this.seal(session)); return { accepted: true }; }); }
  async signout(handle: string, nonce: string, all = false) {
    handleShape(handle); const key = 'session:v2:' + await hash(handle);
    await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const s = await this.open<BrowserSession>(raw);
      if (s.version !== 2 || s.csrf !== nonce || s.absoluteUntil <= Date.now()) throw new AccessDenied();
      if (all) { const active = (await this.valid(tx, handle)).session; const epoch = await this.epoch(tx, active.identity.subject), sequence = (await tx.get<number>('revocation-sequence:v2') ?? 0) + 1; await tx.put('revocation-sequence:v2', sequence); await tx.put('epoch:v2:' + active.identity.subject, { generation: epoch.generation + 1, revokedAtSequence: sequence }); }
      const ledgerKey = 'browser:v2:' + s.browser, ledger = await tx.get<Ledger>(ledgerKey); if (!ledger) throw new AccessDenied();
      if (ledger.active) await tx.delete(ledger.active); ledger.generation++; delete ledger.active; await tx.put(ledgerKey, ledger); await tx.delete('pending:v2:' + s.browser); await tx.delete(key);
    });
  }
}
export interface BrowserEnv { BROWSER_SESSION_KEY_HEX: string; BROWSER_SESSION_KEY_ID?: string; BROWSER_SESSION_PREVIOUS_KEYS_JSON?: string; VAULT_KEY_HEX?: string; }
export class AccountBrowserSessions implements DurableObject {
  constructor(private state: DurableObjectState, private env: BrowserEnv) {}
  async fetch(request: Request) {
    try {
      if (request.method !== 'POST' || !/^[a-f0-9]{64}$/.test(this.env.BROWSER_SESSION_KEY_HEX)) throw new AccessDenied();
      if (this.env.VAULT_KEY_HEX === this.env.BROWSER_SESSION_KEY_HEX) throw new AccessDenied();
      const decodeKey = (hex: string) => { if (!/^[a-f0-9]{64}$/.test(hex)) throw new AccessDenied(); return Uint8Array.from(hex.match(/../g)!, n => parseInt(n, 16)); };
      const previous = JSON.parse(this.env.BROWSER_SESSION_PREVIOUS_KEYS_JSON ?? '[]') as { id: string; keyHex: string; notAfter: number }[];
      if (!Array.isArray(previous) || previous.length > 2) throw new AccessDenied();
      const store = new BrowserSessions(this.state.storage, decodeKey(this.env.BROWSER_SESSION_KEY_HEX), this.env.BROWSER_SESSION_KEY_ID, previous.map(p => { if (p.keyHex === this.env.VAULT_KEY_HEX) throw new AccessDenied(); return { id: p.id, key: decodeKey(p.keyHex), notAfter: p.notAfter }; }));
      const text = await request.text(); if (text.length > 16384) throw new AccessDenied();
      const b = JSON.parse(text) as { operation: string; handle: string; activeHandle?: string; nonce: string; state: string; transaction: IdentityTransaction; githubId: number; identity: AccountIdentity; consume?: boolean; proof: string };
      if (b.operation === 'commit-repository' || b.operation === 'commit-connector') {
        const value = JSON.parse(text) as { operation: string; handle: string; proof: BrowserGrantProof; candidateId?: string; assertion: string; authorizationUrl?: string };
        // All provider I/O has already finished. This event gate linearizes final authorization
        // with signout/revoke-all; it is NOT a distributed rollback transaction.
        return await this.state.blockConcurrencyWhile(async () => {
          try {
            const session = await store.load(value.handle), proof = value.proof;
            if (Date.now() - session.verifiedAt > 300_000 || proof.handle !== value.handle || proof.generation !== session.generation || proof.accountEpoch !== session.accountEpoch || proof.subject !== session.identity.subject || proof.githubId !== session.identity.githubId) throw new AccessDenied();
            const env = this.env as BrowserEnv & AccountEnv;
            if (env.PRIVATE_ACTIVATION !== 'owner-verified') throw new AccessDenied();
            if (value.operation === 'commit-repository') {
              const committed = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(session.identity.subject)).fetch(new Request('https://internal.invalid/internal/grant/commit', { method: 'POST', headers: { Authorization: 'Bearer ' + value.assertion }, body: JSON.stringify({ candidateId: value.candidateId, browser: proof }) }));
              if (!committed.ok) throw new AccessDenied(); return Response.json(await committed.json());
            }
            if (!env.ACCOUNT_CONNECTOR_KV || typeof value.authorizationUrl !== 'string') throw new AccessDenied();
            const { getOAuthApi } = await import('@cloudflare/workers-oauth-provider');
            const { completeConnectorConsent } = await import('./broker');
            const helpers = getOAuthApi({ apiRoute: env.RESOURCE, apiHandler: { fetch: () => new Response('', { status: 403 }) }, defaultHandler: { fetch: () => new Response('', { status: 403 }) }, authorizeEndpoint: env.ACCOUNT_ISSUER + '/authorize', tokenEndpoint: env.ACCOUNT_ISSUER + '/token', resourceMatchOriginOnly: false, scopesSupported: ['repository:read'] }, { ...env, OAUTH_KV: env.ACCOUNT_CONNECTOR_KV });
            return await completeConnectorConsent(new Request(env.ACCOUNT_ISSUER + '/authorize', { method: 'POST', headers: { Origin: new URL(env.ACCOUNT_ISSUER).origin, Authorization: 'Bearer ' + value.assertion }, body: JSON.stringify({ approved: true, authorizationUrl: value.authorizationUrl }) }), env, helpers);
          } catch { return Response.json({ error: 'authorization_outcome_unavailable' }, { status: 403 }); }
        });
      }
      if (b.operation === 'begin') return Response.json(await store.begin(b.handle, b.activeHandle));
      if (b.operation === 'start') return Response.json(await store.start(b.handle, b.nonce, b.transaction));
      if (b.operation === 'consume') return Response.json(await store.consume(b.handle, b.nonce, b.state));
      if (b.operation === 'activate') return Response.json(await store.activate(b.githubId, b.proof));
      if (b.operation === 'discard') { await store.discard(b.proof); return Response.json({ discarded: true }); }
      if (b.operation === 'verify') return Response.json(await store.verify(b.identity));
      if (b.operation === 'repository-state') return Response.json(await store.repositoryCallback(b.handle, b.nonce, b.consume));
      if (b.operation === 'touch') return Response.json(await store.touch(b.handle));
      if (b.operation === 'load') return Response.json(await store.load(b.handle));
      if (b.operation === 'csrf') return Response.json(await store.csrf(b.handle, b.nonce));
      if (b.operation === 'signout' || b.operation === 'revoke-all-local-browser-sessions') { await store.signout(b.handle, b.nonce, b.operation !== 'signout'); return Response.json({ invalidated: true }); }
      throw new AccessDenied();
    } catch { return Response.json({ error: 'access_denied' }, { status: 403 }); }
  }
}
