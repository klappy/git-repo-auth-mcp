import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';
import { AccessDenied } from './session';
import { resolveIdentity, verifyIdentity, type AccountIdentity } from './identity-registry';
import type { IdentityTransaction } from './oauth';
import type { BrowserGrantProof } from './grants';
import type { AccountEnv } from './broker';
export interface BrowserSession { version: 2; identity: AccountIdentity; createdAt: number; verifiedAt: number; idleUntil: number; absoluteUntil: number; generation: number; accountEpoch: number; browser: string; browserHandle: string; csrf: string; status: 'active'; repositoryState?: { state: string; expiresAt: number; continuationHash?: string }; }
interface Ledger { generation: number; active?: string; pendingNonce?: string; stateBindings?: { stateHash: string; nonceHash: string; continuationHash?: string; expiresAt: number }[]; }
interface Epoch { generation: number; revokedAtSequence: number; }
interface Pending { version: 2; browser: string; browserHandle: string; nonce: string; expiresAt: number; generation: number; sequence: number; expected?: AccountIdentity; expectedEpoch?: number; transaction?: IdentityTransaction; continuationHash?: string; }
export interface ContinuationIntent { clientId: string; redirectUri: string; state: string; responseType: 'code'; codeChallenge: string; codeChallengeMethod: 'S256'; resource: string; scope: ['repository:read']; }
interface Continuation { version: 1; refHash: string; browser: string; generation: number; sequence: number; expiresAt: number; stage: 'awaiting_identity' | 'awaiting_repository' | 'ready_for_connector' | 'spent'; expected?: AccountIdentity; expectedEpoch?: number; intent?: ContinuationIntent; }
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
  private async continuation(tx: DurableObjectTransaction, browser: string, refHash: string) {
    const raw = await tx.get<string>('continuation:v2:' + browser); if (!raw) throw new AccessDenied();
    const c = await this.open<Continuation>(raw), ledger = await tx.get<Ledger>('browser:v2:' + browser);
    if (c.version !== 1 || c.refHash !== refHash || c.browser !== browser || c.generation !== ledger?.generation || c.expiresAt <= Date.now() || c.stage === 'spent' || !c.intent) throw new AccessDenied();
    if (c.expected) { await verifyIdentity(tx, c.expected); const epoch = await this.epoch(tx, c.expected.subject); if (epoch.generation !== c.expectedEpoch || epoch.revokedAtSequence > c.sequence) throw new AccessDenied(); }
    return c;
  }
  async createContinuation(browserHandle: string, intent: ContinuationIntent, activeHandle?: string) {
    handleShape(browserHandle); const ref = opaque(), refHash = await hash(ref);
    if (!intent || new TextEncoder().encode(JSON.stringify(intent)).byteLength > 7168 || Object.keys(intent).sort().join(',') !== 'clientId,codeChallenge,codeChallengeMethod,redirectUri,resource,responseType,scope,state' || intent.responseType !== 'code' || intent.codeChallengeMethod !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(intent.codeChallenge) || typeof intent.clientId !== 'string' || !intent.clientId || typeof intent.state !== 'string' || !intent.state || !Array.isArray(intent.scope) || intent.scope.length !== 1 || intent.scope[0] !== 'repository:read' || typeof intent.redirectUri !== 'string' || typeof intent.resource !== 'string') throw new AccessDenied();
    return this.storage.transaction(async tx => {
      const s = activeHandle ? (await this.valid(tx, activeHandle)).session : undefined;
      if (s && s.browserHandle !== browserHandle) throw new AccessDenied();
      const browser = await hash(browserHandle), key = 'browser:v2:' + browser, ledger = await tx.get<Ledger>(key) ?? { generation: 0 };
      for (const [limitKey, limit] of [['continuation-attempt:v2:' + browser, 10], ['continuation-attempt:v2:global', 1000]] as const) { const window = Math.floor(Date.now() / 60000), counter = await tx.get<{ window: number; count: number }>(limitKey); const count = counter?.window === window ? counter.count + 1 : 1; if (count > limit) throw new AccessDenied(); await tx.put(limitKey, { window, count }); }
      const c: Continuation = { version: 1, refHash, browser, generation: ledger.generation, sequence: await tx.get<number>('revocation-sequence:v2') ?? 0, expiresAt: Date.now() + 300000, stage: 'awaiting_identity', intent, ...(s ? { expected: s.identity, expectedEpoch: s.accountEpoch } : {}) };
      if (new TextEncoder().encode(JSON.stringify(c)).byteLength > 8192) throw new AccessDenied();
      await tx.put(key, ledger); await tx.put('continuation:v2:' + browser, await this.seal(c)); return { ref, expiresAt: c.expiresAt };
    });
  }
  async loadContinuation(browserHandle: string, ref: string, sessionHandle?: string) {
    handleShape(browserHandle); handleShape(ref);
    return this.storage.transaction(async tx => {
      const c = await this.continuation(tx, await hash(browserHandle), await hash(ref));
      if (sessionHandle) { const s = (await this.valid(tx, sessionHandle)).session; if (s.browser !== c.browser || (c.expected && (s.identity.subject !== c.expected.subject || s.identity.githubId !== c.expected.githubId || s.accountEpoch !== c.expectedEpoch))) throw new AccessDenied(); }
      return c; // Binding-only data, never a public response or a session issuance seam.
    });
  }
  async stageContinuation(handle: string, ref: string, next: 'awaiting_repository' | 'ready_for_connector') {
    handleShape(ref); return this.storage.transaction(async tx => {
      const s = (await this.valid(tx, handle)).session, c = await this.continuation(tx, s.browser, await hash(ref));
      if (!c.expected || c.expected.subject !== s.identity.subject || c.expectedEpoch !== s.accountEpoch || Date.now() - s.verifiedAt > 300000 || !['awaiting_repository', 'ready_for_connector'].includes(next) || (c.stage === 'ready_for_connector' && next !== c.stage)) throw new AccessDenied();
      c.stage = next; await tx.put('continuation:v2:' + s.browser, await this.seal(c)); return { stage: c.stage };
    });
  }
  async retireContinuation(browserHandle: string, ref: string) { handleShape(browserHandle); handleShape(ref); return this.storage.transaction(async tx => { const key = 'continuation:v2:' + await hash(browserHandle), raw = await tx.get<string>(key); if (raw && (await this.open<Continuation>(raw)).refHash === await hash(ref)) await tx.delete(key); return { retired: true }; }); }
  async cancelContinuation(browserHandle: string, ref: string, nonce: string, activeHandle?: string) {
    handleShape(browserHandle); handleShape(ref); return this.storage.transaction(async tx => {
      const browser = await hash(browserHandle), c = await this.continuation(tx, browser, await hash(ref));
      const ledger = await tx.get<Ledger>('browser:v2:' + browser), pendingRaw = await tx.get<string>('pending:v2:' + browser), pendingLease = pendingRaw ? await this.open<Pending>(pendingRaw) : undefined, nonceHash = await hash(nonce);
      const pendingAuthorized = Boolean(nonce && ledger?.pendingNonce === nonce && ((pendingLease?.nonce === nonce && pendingLease.continuationHash === c.refHash && pendingLease.generation === c.generation && pendingLease.expiresAt > Date.now()) || ledger.stateBindings?.some(binding => binding.nonceHash === nonceHash && binding.continuationHash === c.refHash && binding.expiresAt > Date.now())));
      if (activeHandle) { const { key, session } = await this.valid(tx, activeHandle); if (session.browser !== browser || (session.csrf !== nonce && !pendingAuthorized)) throw new AccessDenied(); session.csrf = opaque(); await tx.put(key, await this.seal(session)); }
      else if (!pendingAuthorized) throw new AccessDenied();
      await tx.delete('continuation:v2:' + browser);
      const pending = await tx.get<string>('pending:v2:' + browser); if (pending && (await this.open<Pending>(pending)).continuationHash === c.refHash) await tx.delete('pending:v2:' + browser);
      return { canceled: true };
    });
  }
  async spendContinuation(handle: string, ref: string) {
    handleShape(ref); return this.storage.transaction(async tx => {
      const s = (await this.valid(tx, handle)).session, c = await this.continuation(tx, s.browser, await hash(ref));
      if (c.stage !== 'ready_for_connector' || !c.expected || c.expected.subject !== s.identity.subject || c.expectedEpoch !== s.accountEpoch || Date.now() - s.verifiedAt > 300000) throw new AccessDenied();
      const intent = c.intent!; delete c.intent; c.stage = 'spent'; await tx.put('continuation:v2:' + s.browser, await this.seal(c)); return intent;
    });
  }
  async begin(browser: string, activeHandle?: string, continuationRef?: string) {
    handleShape(browser);
    return this.storage.transaction(async tx => {
      let active: BrowserSession | undefined;
      if (activeHandle) { active = (await this.valid(tx, activeHandle)).session; browser = active.browserHandle; }
      const browserHash = await hash(browser), ledgerKey = 'browser:v2:' + browserHash;
      const ledger = await tx.get<Ledger>(ledgerKey) ?? { generation: 0 };
      const cont = continuationRef ? await this.continuation(tx, browserHash, await hash(continuationRef)) : undefined;
      if (cont?.expected && active && (active.identity.subject !== cont.expected.subject || active.accountEpoch !== cont.expectedEpoch)) throw new AccessDenied();
      // Starting reauthentication does not retire the current session; a nonce is a separate lease.
      const pending: Pending = { version: 2, browser: browserHash, browserHandle: browser, nonce: opaque(), expiresAt: Date.now() + 300_000, generation: ledger.generation, sequence: await tx.get<number>('revocation-sequence:v2') ?? 0, ...(active ? { expected: active.identity, expectedEpoch: active.accountEpoch } : {}) };
      if (cont) { pending.continuationHash = cont.refHash; pending.expiresAt = Math.min(pending.expiresAt, cont.expiresAt); if (cont.expected) { pending.expected = cont.expected; pending.expectedEpoch = cont.expectedEpoch; } }
      for (const [limitKey, limit] of [['attempt:v2:' + browserHash, 10], ['attempt:v2:global', 1000]] as const) {
        const window = Math.floor(Date.now() / 60000), counter = await tx.get<{ window: number; count: number }>(limitKey);
        const count = counter?.window === window ? counter.count + 1 : 1; if (count > limit) throw new AccessDenied(); await tx.put(limitKey, { window, count });
      }
      ledger.pendingNonce = pending.nonce;
      await tx.put(ledgerKey, ledger); await tx.put('pending:v2:' + browserHash, await this.seal(pending));
      return { nonce: pending.nonce, expiresAt: pending.expiresAt, browserHandle: browser };
    });
  }
  async start(browser: string, nonce: string, transaction: IdentityTransaction, continuationRef?: string) {
    handleShape(browser); const key = 'pending:v2:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      if (p.version !== 2 || p.nonce !== nonce || p.expiresAt <= Date.now() || p.transaction || transaction.kind !== 'identity-bootstrap' || transaction.expiresAt <= Date.now()) throw new AccessDenied();
      const ledger = await tx.get<Ledger>('browser:v2:' + p.browser); if (ledger?.generation !== p.generation) throw new AccessDenied();
      if (p.continuationHash) { if (!continuationRef || await hash(continuationRef) !== p.continuationHash) throw new AccessDenied(); await this.continuation(tx, p.browser, p.continuationHash); } else if (continuationRef) throw new AccessDenied();
      // Retain only bounded hashes so a recognized old callback cannot burn a replacement Pending.
      const bindings = (ledger.stateBindings ?? []).filter(value => value.expiresAt > Date.now()); if (bindings.length >= 60) throw new AccessDenied();
      bindings.push({ stateHash: await hash(transaction.state), nonceHash: await hash(nonce), continuationHash: p.continuationHash, expiresAt: p.expiresAt }); ledger.stateBindings = bindings; await tx.put('browser:v2:' + p.browser, ledger);
      p.transaction = { ...transaction, expiresAt: Math.min(p.expiresAt, transaction.expiresAt) }; await tx.put(key, await this.seal(p)); return { started: true };
    });
  }
  async consume(browser: string, nonce: string, state: string, continuationRef?: string) {
    handleShape(browser); const key = 'pending:v2:' + await hash(browser);
    const result = await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      if (p.nonce !== nonce) throw new AccessDenied(); // Unknown browser nonce cannot cancel another flow.
      const stateHash = await hash(state), nonceHash = await hash(nonce);
      const known = (await tx.get<Ledger>('browser:v2:' + p.browser))?.stateBindings?.find(value => value.stateHash === stateHash);
      if (known && (known.nonceHash !== nonceHash || known.continuationHash !== p.continuationHash)) throw new AccessDenied();
      await tx.delete(key);
      if (p.version !== 2 || p.expiresAt <= Date.now() || !p.transaction || p.transaction.state !== state || (await tx.get<Ledger>('browser:v2:' + p.browser))?.generation !== p.generation) return undefined;
      if (p.continuationHash) { if (!continuationRef || await hash(continuationRef) !== p.continuationHash) return undefined; try { await this.continuation(tx, p.browser, p.continuationHash); } catch { return undefined; } } else if (continuationRef) return undefined;
      const proof = opaque(); const transaction = p.transaction; delete p.transaction;
      await tx.delete(key); await tx.put('activation:v2:' + await hash(proof), await this.seal(p));
      return { transaction, proof };
    });
    if (!result) throw new AccessDenied(); return result;
  }
  async discard(proof: string) { handleShape(proof); await this.storage.delete('activation:v2:' + await hash(proof)); }
  async activate(githubId: number, proof: string) {
    handleShape(proof); const handle = opaque(), key = 'session:v2:' + await hash(handle), proofKey = 'activation:v2:' + await hash(proof);
    let mismatched: { browser: string; refHash: string } | undefined;
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(proofKey); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      const ledgerKey = 'browser:v2:' + p.browser, ledger = await tx.get<Ledger>(ledgerKey);
      if (p.version !== 2 || !ledger || ledger.generation !== p.generation || ledger.pendingNonce !== p.nonce || p.expiresAt <= Date.now()) throw new AccessDenied();
      const identity = await resolveIdentity(tx, githubId), epoch = await this.epoch(tx, identity.subject);
      if (p.continuationHash && p.expected && (p.expected.subject !== identity.subject || p.expected.githubId !== githubId)) mismatched = { browser: p.browser, refHash: p.continuationHash };
      if (epoch.revokedAtSequence > p.sequence || (p.expected && (p.expected.subject !== identity.subject || p.expected.githubId !== githubId || p.expectedEpoch !== epoch.generation))) throw new AccessDenied();
      const cont = p.continuationHash ? await this.continuation(tx, p.browser, p.continuationHash) : undefined;
      if (ledger.active) { const oldRaw = await tx.get<string>(ledger.active); if (oldRaw) { const old = await this.open<BrowserSession>(oldRaw); await tx.put(ledger.active, await this.seal({ version: 2, status: 'retired', browser: old.browser, csrf: old.csrf, absoluteUntil: old.absoluteUntil })); } }
      ledger.generation++; ledger.active = key; delete ledger.pendingNonce; const now = Date.now();
      if (cont) { cont.generation = ledger.generation; cont.expected = identity; cont.expectedEpoch = epoch.generation; await tx.put('continuation:v2:' + p.browser, await this.seal(cont)); }
      const session: BrowserSession = { version: 2, identity, createdAt: now, verifiedAt: now, idleUntil: now + 1_800_000, absoluteUntil: now + 28_800_000, generation: ledger.generation, accountEpoch: epoch.generation, browser: p.browser, browserHandle: p.browserHandle, csrf: opaque(), status: 'active' };
      await tx.delete(proofKey); await tx.put(ledgerKey, ledger); await tx.put(key, await this.seal(session)); return { handle, csrf: session.csrf };
    }).catch(async error => { await this.storage.delete(proofKey); if (mismatched) { const target = mismatched; await this.storage.transaction(async tx => { const key = 'continuation:v2:' + target.browser, raw = await tx.get<string>(key); if (raw && (await this.open<Continuation>(raw)).refHash === target.refHash) await tx.delete(key); }); } throw error; });
  }
  async load(handle: string) { return this.storage.transaction(async tx => (await this.valid(tx, handle)).session); }
  async verify(identity: AccountIdentity) { return this.storage.transaction(async tx => { await verifyIdentity(tx, identity); return identity; }); }
  async csrf(handle: string, nonce: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); if (session.csrf !== nonce) throw new AccessDenied(); session.csrf = opaque(); await tx.put(key, await this.seal(session)); return session; }); }
  async touch(handle: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); session.idleUntil = Math.min(Date.now() + 1_800_000, session.absoluteUntil); await tx.put(key, await this.seal(session)); return session; }); }
  async repositoryCallback(handle: string, state: string, consume = false, continuationRef?: string) { return this.storage.transaction(async tx => {
    const { key, session } = await this.valid(tx, handle); if (!state || state.length > 256) throw new AccessDenied();
    const cont = continuationRef ? await this.continuation(tx, session.browser, await hash(continuationRef)) : undefined;
    if (consume) { if (session.repositoryState?.state !== state || session.repositoryState.expiresAt <= Date.now() || session.repositoryState.continuationHash !== cont?.refHash) throw new AccessDenied(); delete session.repositoryState; }
    else { if (Date.now() - session.verifiedAt > 300000) throw new AccessDenied(); session.repositoryState = { state, expiresAt: Math.min(Date.now() + 300000, cont?.expiresAt ?? Infinity), ...(cont ? { continuationHash: cont.refHash } : {}) }; }
    await tx.put(key, await this.seal(session)); return { accepted: true };
  }); }
  async signout(handle: string, nonce: string, all = false) {
    handleShape(handle); const key = 'session:v2:' + await hash(handle);
    await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const s = await this.open<BrowserSession>(raw);
      if (s.version !== 2 || s.csrf !== nonce || s.absoluteUntil <= Date.now()) throw new AccessDenied();
      if (all) { const active = (await this.valid(tx, handle)).session; const epoch = await this.epoch(tx, active.identity.subject), sequence = (await tx.get<number>('revocation-sequence:v2') ?? 0) + 1; await tx.put('revocation-sequence:v2', sequence); await tx.put('epoch:v2:' + active.identity.subject, { generation: epoch.generation + 1, revokedAtSequence: sequence }); }
      const ledgerKey = 'browser:v2:' + s.browser, ledger = await tx.get<Ledger>(ledgerKey); if (!ledger) throw new AccessDenied();
      if (ledger.active) await tx.delete(ledger.active); ledger.generation++; delete ledger.active; await tx.put(ledgerKey, ledger); await tx.delete('pending:v2:' + s.browser); await tx.delete('continuation:v2:' + s.browser); await tx.delete(key);
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
      const b = JSON.parse(text) as { operation: string; handle: string; activeHandle?: string; nonce: string; state: string; transaction: IdentityTransaction; githubId: number; identity: AccountIdentity; consume?: boolean; proof: string; continuationRef?: string; ref: string; intent: ContinuationIntent; next: 'awaiting_repository' | 'ready_for_connector' };
      if (b.operation === 'commit-repository' || b.operation === 'commit-connector') {
        const value = JSON.parse(text) as { operation: string; handle: string; proof: BrowserGrantProof; candidateId?: string; assertion: string; authorizationUrl?: string; continuationRef?: string };
        // All provider I/O has already finished. This event gate linearizes final authorization
        // with signout/revoke-all; it is NOT a distributed rollback transaction.
        return await this.state.blockConcurrencyWhile(async () => {
          try {
            const session = await store.load(value.handle), proof = value.proof;
            if (Date.now() - session.verifiedAt > 300_000 || proof.handle !== value.handle || proof.generation !== session.generation || proof.accountEpoch !== session.accountEpoch || proof.subject !== session.identity.subject || proof.githubId !== session.identity.githubId) throw new AccessDenied();
            const env = this.env as BrowserEnv & AccountEnv;
            if (env.PRIVATE_ACTIVATION !== 'owner-verified') throw new AccessDenied();
            if (value.continuationRef) await store.loadContinuation(session.browserHandle, value.continuationRef, value.handle);
            if (value.operation === 'commit-repository') {
              const committed = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(session.identity.subject)).fetch(new Request('https://internal.invalid/internal/grant/commit', { method: 'POST', headers: { Authorization: 'Bearer ' + value.assertion }, body: JSON.stringify({ candidateId: value.candidateId, browser: proof }) }));
              if (!committed.ok) throw new AccessDenied(); return Response.json(await committed.json());
            }
            if (!env.ACCOUNT_CONNECTOR_KV) throw new AccessDenied();
            if (value.continuationRef) {
              const intent = await store.spendContinuation(value.handle, value.continuationRef);
              if (intent.resource !== env.RESOURCE) throw new AccessDenied();
              const url = new URL('/authorize', env.ACCOUNT_ISSUER);
              url.search = new URLSearchParams({ client_id: intent.clientId, redirect_uri: intent.redirectUri, response_type: intent.responseType, state: intent.state, scope: intent.scope.join(' '), resource: intent.resource, code_challenge: intent.codeChallenge, code_challenge_method: intent.codeChallengeMethod }).toString();
              value.authorizationUrl = url.toString();
            }
            if (typeof value.authorizationUrl !== 'string') throw new AccessDenied();
            const { getOAuthApi } = await import('@cloudflare/workers-oauth-provider');
            const { completeConnectorConsent } = await import('./broker');
            const helpers = getOAuthApi({ apiRoute: env.RESOURCE, apiHandler: { fetch: () => new Response('', { status: 403 }) }, defaultHandler: { fetch: () => new Response('', { status: 403 }) }, authorizeEndpoint: env.ACCOUNT_ISSUER + '/authorize', tokenEndpoint: env.ACCOUNT_ISSUER + '/token', resourceMatchOriginOnly: false, scopesSupported: ['repository:read'] }, { ...env, OAUTH_KV: env.ACCOUNT_CONNECTOR_KV });
            return await completeConnectorConsent(new Request(env.ACCOUNT_ISSUER + '/authorize', { method: 'POST', headers: { Origin: new URL(env.ACCOUNT_ISSUER).origin, Authorization: 'Bearer ' + value.assertion }, body: JSON.stringify({ approved: true, authorizationUrl: value.authorizationUrl }) }), env, helpers);
          } catch { return Response.json({ error: 'authorization_outcome_unavailable' }, { status: 403 }); }
        });
      }
      if (b.operation === 'continuation-create') { if (b.intent.resource !== (this.env as BrowserEnv & AccountEnv).RESOURCE) throw new AccessDenied(); return Response.json(await store.createContinuation(b.handle, b.intent, b.activeHandle)); }
      if (b.operation === 'continuation-load') return Response.json(await store.loadContinuation(b.handle, b.ref, b.activeHandle));
      if (b.operation === 'continuation-stage') return Response.json(await store.stageContinuation(b.handle, b.ref, b.next));
      if (b.operation === 'continuation-retire') return Response.json(await store.retireContinuation(b.handle, b.ref));
      if (b.operation === 'continuation-cancel') return Response.json(await store.cancelContinuation(b.handle, b.ref, b.nonce, b.activeHandle));
      if (b.operation === 'begin') return Response.json(await store.begin(b.handle, b.activeHandle, b.continuationRef));
      if (b.operation === 'start') return Response.json(await store.start(b.handle, b.nonce, b.transaction, b.continuationRef));
      if (b.operation === 'consume') return Response.json(await store.consume(b.handle, b.nonce, b.state, b.continuationRef));
      if (b.operation === 'activate') return Response.json(await store.activate(b.githubId, b.proof));
      if (b.operation === 'discard') { await store.discard(b.proof); return Response.json({ discarded: true }); }
      if (b.operation === 'verify') return Response.json(await store.verify(b.identity));
      if (b.operation === 'repository-state') return Response.json(await store.repositoryCallback(b.handle, b.nonce, b.consume, b.continuationRef));
      if (b.operation === 'touch') return Response.json(await store.touch(b.handle));
      if (b.operation === 'load') return Response.json(await store.load(b.handle));
      if (b.operation === 'csrf') return Response.json(await store.csrf(b.handle, b.nonce));
      if (b.operation === 'signout' || b.operation === 'revoke-all-local-browser-sessions') { await store.signout(b.handle, b.nonce, b.operation !== 'signout'); return Response.json({ invalidated: true }); }
      throw new AccessDenied();
    } catch { return Response.json({ error: 'access_denied' }, { status: 403 }); }
  }
}
