import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from 'jose';
import { AccessDenied } from './session';
import { resolveIdentity, verifyIdentity, type AccountIdentity } from './identity-registry';
import type { IdentityTransaction } from './oauth';
import type { BrowserGrantProof } from './grants';
import type { AccountEnv } from './broker';
interface AccountRepositoryLease { purpose: 'account'; lease: string; state: string; expiresAt: number; phase: 'prepared' | 'awaiting_callback' | 'exchanging' | 'committing'; snapshot: Restart; subject: string; githubId: number; accountEpoch: number; candidateId?: string; startAttempt?: string; }
export interface BrowserSession { version: 2; identity: AccountIdentity; createdAt: number; verifiedAt: number; idleUntil: number; absoluteUntil: number; generation: number; accountEpoch: number; browser: string; browserHandle: string; csrf: string; status: 'active'; repositoryState?: { purpose?: 'connector'; state: string; expiresAt: number; continuationHash?: string; lease?: string; startAttempt?: string } | AccountRepositoryLease; }
interface StartMarker { version: 1; subject: string; browser: string; generation: number; purpose: 'account' | 'connector'; lease: string; attempt: string; }
const startMarkerKey = 'repository-start:v2:in-flight';
interface Restart { refHash?: string; slotHash?: string; revision: number; generation: number; }
interface Ledger { generation: number; slotRevision?: number; active?: string; pendingNonce?: string; stateBindings?: { stateHash: string; nonceHash: string; continuationHash?: string; restart?: Restart; expiresAt: number }[]; }
interface Epoch { generation: number; revokedAtSequence: number; }
interface Pending { version: 2; browser: string; browserHandle: string; nonce: string; expiresAt: number; generation: number; sequence: number; expected?: AccountIdentity; expectedEpoch?: number; transaction?: IdentityTransaction; continuationHash?: string; restart?: Restart; unbound?: Restart; }
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
  private async epoch(tx: DurableObjectTransaction, subject: string): Promise<Epoch> { const raw = await tx.get<Epoch>('epoch:v2:' + subject); if (raw === undefined) return { generation: 0, revokedAtSequence: 0 }; if (!raw || typeof raw !== 'object' || !Number.isSafeInteger(raw.generation) || raw.generation < 0 || !Number.isSafeInteger(raw.revokedAtSequence) || raw.revokedAtSequence < 0) throw new AccessDenied(); return raw; }
  private revision(ledger: Ledger) { const n = ledger.slotRevision === undefined ? 0 : ledger.slotRevision; if (!Number.isSafeInteger(n) || n < 0) throw new AccessDenied(); return n; }
  private async bump(tx: DurableObjectTransaction, browser: string, supplied?: Ledger) { const ledger = supplied ?? await tx.get<Ledger>('browser:v2:' + browser); if (!ledger) throw new AccessDenied(); const n = this.revision(ledger); if (n === Number.MAX_SAFE_INTEGER) throw new AccessDenied(); ledger.slotRevision = n + 1; await tx.put('browser:v2:' + browser, ledger); }
  private async terminal(tx: DurableObjectTransaction, browser: string, ledger: Ledger, refHash?: string, selectTerminal = false) {
    this.revision(ledger); const raw = await tx.get<string>('continuation:v2:' + browser); if (raw === undefined) return undefined; if (typeof raw !== 'string' || !raw) throw new AccessDenied();
    const c = await this.open<Continuation>(raw);
    if (typeof c.refHash !== 'string' || !/^[a-f0-9]{64}$/.test(c.refHash) || c.version !== 1 || (refHash ? c.refHash !== refHash : !selectTerminal) || c.browser !== browser || c.generation !== ledger.generation || !Number.isSafeInteger(c.expiresAt) || !Number.isSafeInteger(c.sequence) || !['awaiting_identity', 'awaiting_repository', 'ready_for_connector', 'spent'].includes(c.stage) || (c.expiresAt > Date.now() && c.stage !== 'spent')) throw new AccessDenied();
    if (Object.hasOwn(c, 'expected') && !c.expected) throw new AccessDenied();
    if (c.expected) { await verifyIdentity(tx, c.expected); const epoch = await this.epoch(tx, c.expected.subject); if (!Number.isSafeInteger(c.expectedEpoch) || c.expectedEpoch !== epoch.generation || epoch.revokedAtSequence > c.sequence) throw new AccessDenied(); }
    else if (c.expectedEpoch !== undefined || c.stage !== 'awaiting_identity') throw new AccessDenied();
    return c;
  }
  private async checkRestart(tx: DurableObjectTransaction, browser: string, restart: Restart, ledger: Ledger) {
    if (restart.generation !== ledger.generation || restart.revision !== this.revision(ledger)) throw new AccessDenied();
    const c = await this.terminal(tx, browser, ledger, restart.slotHash); if (c?.refHash !== restart.slotHash) throw new AccessDenied();
  }
  private async noAccountLease(tx: DurableObjectTransaction, ledger: Ledger) {
    if (!ledger.active) return; const raw = await tx.get<string>(ledger.active); if (typeof raw !== 'string' || !raw) throw new AccessDenied();
    const session = await this.open<BrowserSession>(raw); if (session.repositoryState && session.repositoryState.expiresAt > Date.now()) throw new AccessDenied();
  }
  private async accountLease(tx: DurableObjectTransaction, session: BrowserSession, lease: string) {
    const r = session.repositoryState; if (!r || r.purpose !== 'account' || r.lease !== lease || r.expiresAt <= Date.now() || r.subject !== session.identity.subject || r.githubId !== session.identity.githubId || r.accountEpoch !== session.accountEpoch) throw new AccessDenied();
    const ledger = await tx.get<Ledger>('browser:v2:' + session.browser); if (!ledger) throw new AccessDenied(); await this.checkRestart(tx, session.browser, r.snapshot, ledger); return r;
  }
  private async valid(tx: DurableObjectTransaction, handle: string) {
    handleShape(handle); const key = 'session:v2:' + await hash(handle), raw = await tx.get<string>(key); if (!raw) throw new AccessDenied();
    const s = await this.open<BrowserSession>(raw), now = Date.now();
    if (s.version !== 2 || s.status !== 'active' || s.idleUntil <= now || s.absoluteUntil <= now || s.createdAt > now || s.absoluteUntil > s.createdAt + 28_800_000 || 'managed' in s) throw new AccessDenied();
    await verifyIdentity(tx, s.identity);
    const ledger = await tx.get<Ledger>('browser:v2:' + s.browser), epoch = await this.epoch(tx, s.identity.subject);
    if (ledger?.active !== key || ledger.generation !== s.generation || epoch.generation !== s.accountEpoch) throw new AccessDenied();
    return { key, session: s };
  }
  private async identityBinding(tx: DurableObjectTransaction, browserHandle: string, activeHandle?: string) {
    let supplied: BrowserSession | undefined, suppliedKey: string | undefined;
    if (activeHandle) {
      handleShape(activeHandle); suppliedKey = 'session:v2:' + await hash(activeHandle); const raw = await tx.get<string>(suppliedKey);
      if (raw === undefined) throw new AccessDenied();
      if (raw !== undefined) { if (typeof raw !== 'string' || !raw) throw new AccessDenied(); supplied = await this.open<BrowserSession>(raw); if (supplied.status !== 'active' || !supplied.browserHandle) throw new AccessDenied(); if (browserHandle && browserHandle !== supplied.browserHandle) throw new AccessDenied(); browserHandle = supplied.browserHandle; }
    }
    handleShape(browserHandle); const browser = await hash(browserHandle), rawLedger = await tx.get<Ledger>('browser:v2:' + browser), ledger = rawLedger === undefined ? { generation: 0 } : rawLedger;
    if (!ledger || !Number.isSafeInteger(ledger.generation) || ledger.generation < 0) throw new AccessDenied(); this.revision(ledger);
    if (!ledger.active) { if (ledger.active !== undefined || supplied) throw new AccessDenied(); return { browserHandle, browser, ledger, session: undefined, usable: false, revoked: false }; }
    if (typeof ledger.active !== 'string' || !/^session:v2:[a-f0-9]{64}$/.test(ledger.active) || (suppliedKey && suppliedKey !== ledger.active)) throw new AccessDenied();
    const raw = await tx.get<string>(ledger.active); if (typeof raw !== 'string' || !raw) throw new AccessDenied(); const s = await this.open<BrowserSession>(raw), now = Date.now();
    if (s.version !== 2 || s.status !== 'active' || s.browser !== browser || s.browserHandle !== browserHandle || s.generation !== ledger.generation || !Number.isSafeInteger(s.createdAt) || s.createdAt > now || !Number.isSafeInteger(s.verifiedAt) || s.verifiedAt > now || !Number.isSafeInteger(s.idleUntil) || s.idleUntil < s.createdAt || !Number.isSafeInteger(s.absoluteUntil) || s.absoluteUntil < s.createdAt || s.absoluteUntil > s.createdAt + 28800000 || !Number.isSafeInteger(s.accountEpoch) || s.accountEpoch < 0 || 'managed' in s) throw new AccessDenied();
    handleShape(s.csrf); await verifyIdentity(tx, s.identity); const rawEpoch = await tx.get<Epoch>('epoch:v2:' + s.identity.subject), epoch = rawEpoch === undefined ? { generation: 0, revokedAtSequence: 0 } : rawEpoch; if (!epoch || typeof epoch !== 'object' || !Number.isSafeInteger(epoch.generation) || epoch.generation < 0 || !Number.isSafeInteger(epoch.revokedAtSequence) || epoch.revokedAtSequence < 0) throw new AccessDenied(); const revoked = s.accountEpoch !== epoch.generation;
    return { browserHandle, browser, ledger, session: s, usable: Boolean(activeHandle) && !revoked && s.idleUntil > now && s.absoluteUntil > now, revoked };
  }
  async entry(browserHandle: string, activeHandle?: string, ref?: string) {
    return this.storage.transaction(async tx => {
      const b = await this.identityBinding(tx, browserHandle, activeHandle);
      if (b.revoked) return { kind: 'revoked', ...(activeHandle && b.session!.absoluteUntil > Date.now() ? { signoutCsrf: b.session!.csrf } : {}) };
      let live = false, terminal = false;
      if (ref) { handleShape(ref); const raw = await tx.get<string>('continuation:v2:' + b.browser); if (raw !== undefined) { if (typeof raw !== 'string' || !raw) throw new AccessDenied(); const c = await this.open<Continuation>(raw); if (c.refHash !== await hash(ref)) throw new AccessDenied(); if (c.stage === 'spent' || c.expiresAt <= Date.now()) { await this.terminal(tx, b.browser, b.ledger, await hash(ref)); terminal = true; } else { const c = await this.continuation(tx, b.browser, await hash(ref)); if (c.expected && b.session && (c.expected.subject !== b.session.identity.subject || c.expectedEpoch !== b.session.accountEpoch)) throw new AccessDenied(); live = true; } } else terminal = true; }
      else { const c = await this.terminal(tx, b.browser, b.ledger, undefined, true); terminal = Boolean(c); }
      return { kind: b.usable ? 'active' : live ? 'live' : terminal ? 'terminal' : b.session ? 'verify' : 'anonymous', browserHandle: b.browserHandle, ...(live ? { live: true } : {}) };
    });
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
      await this.bump(tx, browser, ledger); await tx.put('continuation:v2:' + browser, await this.seal(c)); return { ref, expiresAt: c.expiresAt };
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
      c.stage = next; await this.bump(tx, s.browser); await tx.put('continuation:v2:' + s.browser, await this.seal(c)); return { stage: c.stage };
    });
  }
  async retireContinuation(browserHandle: string, ref: string) { handleShape(browserHandle); handleShape(ref); return this.storage.transaction(async tx => { const browser = await hash(browserHandle), key = 'continuation:v2:' + browser, raw = await tx.get<string>(key); if (raw && (await this.open<Continuation>(raw)).refHash === await hash(ref)) { await this.bump(tx, browser); await tx.delete(key); } return { retired: true }; }); }
  async cancelContinuation(browserHandle: string, ref: string, nonce: string, activeHandle?: string) {
    handleShape(browserHandle); handleShape(ref); return this.storage.transaction(async tx => {
      const browser = await hash(browserHandle), c = await this.continuation(tx, browser, await hash(ref));
      const ledger = await tx.get<Ledger>('browser:v2:' + browser), pendingRaw = await tx.get<string>('pending:v2:' + browser), pendingLease = pendingRaw ? await this.open<Pending>(pendingRaw) : undefined, nonceHash = await hash(nonce);
      const pendingAuthorized = Boolean(nonce && ledger?.pendingNonce === nonce && ((pendingLease?.nonce === nonce && pendingLease.continuationHash === c.refHash && pendingLease.generation === c.generation && pendingLease.expiresAt > Date.now()) || ledger.stateBindings?.some(binding => binding.nonceHash === nonceHash && binding.continuationHash === c.refHash && binding.expiresAt > Date.now())));
      if (activeHandle) { const { key, session } = await this.valid(tx, activeHandle); if (session.browser !== browser || (session.csrf !== nonce && !pendingAuthorized)) throw new AccessDenied(); session.csrf = opaque(); await tx.put(key, await this.seal(session)); }
      else if (!pendingAuthorized) throw new AccessDenied();
      await this.bump(tx, browser); await tx.delete('continuation:v2:' + browser);
      const pending = await tx.get<string>('pending:v2:' + browser); if (pending && (await this.open<Pending>(pending)).continuationHash === c.refHash) await tx.delete('pending:v2:' + browser);
      if (ledger?.active) { const raw = await tx.get<string>(ledger.active); if (raw !== undefined) { const active = await this.open<BrowserSession>(raw); if (active.browser === browser && active.repositoryState?.purpose !== 'account' && active.repositoryState?.continuationHash === c.refHash) { delete active.repositoryState; await tx.put(ledger.active, await this.seal(active)); } } }
      return { canceled: true };
    });
  }
  async spendContinuation(handle: string, ref: string) {
    handleShape(ref); return this.storage.transaction(async tx => {
      const s = (await this.valid(tx, handle)).session, c = await this.continuation(tx, s.browser, await hash(ref));
      if (c.stage !== 'ready_for_connector' || !c.expected || c.expected.subject !== s.identity.subject || c.expectedEpoch !== s.accountEpoch || Date.now() - s.verifiedAt > 300000) throw new AccessDenied();
      const intent = c.intent!; delete c.intent; c.stage = 'spent'; await this.bump(tx, s.browser); await tx.put('continuation:v2:' + s.browser, await this.seal(c)); return intent;
    });
  }
  async begin(browser: string, activeHandle?: string, continuationRef?: string, restart = false) {
    if (continuationRef) handleShape(continuationRef);
    return this.storage.transaction(async tx => {
      const binding = await this.identityBinding(tx, browser, activeHandle); if (binding.revoked) throw new AccessDenied(); const active = binding.session; browser = binding.browserHandle;
      const browserHash = await hash(browser), ledgerKey = 'browser:v2:' + browserHash;
      const storedLedger = await tx.get<Ledger>(ledgerKey), ledger = storedLedger === undefined ? { generation: 0 } : storedLedger;
      if (!ledger || !Number.isSafeInteger(ledger.generation) || ledger.generation < 0) throw new AccessDenied();
      await this.noAccountLease(tx, ledger);
      const refHash = continuationRef ? await hash(continuationRef) : undefined;
      const cont = restart ? await this.terminal(tx, browserHash, ledger, refHash, refHash === undefined) : refHash ? await this.continuation(tx, browserHash, refHash) : undefined;
      if (!restart && !refHash) await this.terminal(tx, browserHash, ledger);
      if (cont?.expected && active && (active.identity.subject !== cont.expected.subject || active.accountEpoch !== cont.expectedEpoch)) throw new AccessDenied();
      // Starting reauthentication does not retire the current session; a nonce is a separate lease.
      const pending: Pending = { version: 2, browser: browserHash, browserHandle: browser, nonce: opaque(), expiresAt: Date.now() + 300_000, generation: ledger.generation, sequence: await tx.get<number>('revocation-sequence:v2') ?? 0, ...(active ? { expected: active.identity, expectedEpoch: active.accountEpoch } : {}) };
      if (restart) pending.restart = { refHash, slotHash: cont?.refHash, revision: this.revision(ledger), generation: ledger.generation };
      else if (!refHash) pending.unbound = { revision: this.revision(ledger), generation: ledger.generation };
      if (cont) { if (!restart) { pending.continuationHash = cont.refHash; pending.expiresAt = Math.min(pending.expiresAt, cont.expiresAt); } if (cont.expected) { pending.expected = cont.expected; pending.expectedEpoch = cont.expectedEpoch; } }
      for (const [limitKey, limit] of [['attempt:v2:' + browserHash, 10], ['attempt:v2:global', 1000]] as const) {
        const window = Math.floor(Date.now() / 60000), counter = await tx.get<{ window: number; count: number }>(limitKey);
        const count = counter?.window === window ? counter.count + 1 : 1; if (count > limit) throw new AccessDenied(); await tx.put(limitKey, { window, count });
      }
      ledger.pendingNonce = pending.nonce;
      await tx.put(ledgerKey, ledger); await tx.put('pending:v2:' + browserHash, await this.seal(pending));
      return { nonce: pending.nonce, expiresAt: pending.expiresAt, browserHandle: browser };
    });
  }
  async start(browser: string, nonce: string, transaction: IdentityTransaction, continuationRef?: string, restart = false) {
    handleShape(browser); const key = 'pending:v2:' + await hash(browser);
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      if (p.version !== 2 || p.nonce !== nonce || p.expiresAt <= Date.now() || p.transaction || transaction.kind !== 'identity-bootstrap' || transaction.expiresAt <= Date.now()) throw new AccessDenied();
      const ledger = await tx.get<Ledger>('browser:v2:' + p.browser); if (ledger?.generation !== p.generation || ledger.pendingNonce !== nonce || Boolean(p.restart) !== restart) throw new AccessDenied();
      if (p.unbound) await this.checkRestart(tx, p.browser, p.unbound, ledger);
      if (p.restart) { if (p.restart.refHash !== (continuationRef ? await hash(continuationRef) : undefined)) throw new AccessDenied(); await this.checkRestart(tx, p.browser, p.restart, ledger); }
      else if (p.continuationHash) { if (!continuationRef || await hash(continuationRef) !== p.continuationHash) throw new AccessDenied(); await this.continuation(tx, p.browser, p.continuationHash); } else if (continuationRef) throw new AccessDenied();
      // Retain only bounded hashes so a recognized old callback cannot burn a replacement Pending.
      const bindings = (ledger.stateBindings ?? []).filter(value => value.expiresAt > Date.now()); if (bindings.length >= 60) throw new AccessDenied();
      bindings.push({ stateHash: await hash(transaction.state), nonceHash: await hash(nonce), continuationHash: p.continuationHash, restart: p.restart, expiresAt: p.expiresAt }); ledger.stateBindings = bindings; await tx.put('browser:v2:' + p.browser, ledger);
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
      if (known && (known.nonceHash !== nonceHash || known.continuationHash !== p.continuationHash || JSON.stringify(known.restart) !== JSON.stringify(p.restart))) throw new AccessDenied();
      if (p.restart) { const ledger = await tx.get<Ledger>('browser:v2:' + p.browser); if (!ledger || ledger.pendingNonce !== nonce) throw new AccessDenied(); await this.checkRestart(tx, p.browser, p.restart, ledger); }
      if (p.unbound) { const ledger = await tx.get<Ledger>('browser:v2:' + p.browser); if (!ledger || ledger.pendingNonce !== nonce) throw new AccessDenied(); await this.checkRestart(tx, p.browser, p.unbound, ledger); }
      await tx.delete(key);
      if (p.version !== 2 || p.expiresAt <= Date.now() || !p.transaction || p.transaction.state !== state || (await tx.get<Ledger>('browser:v2:' + p.browser))?.generation !== p.generation) return undefined;
      if (p.continuationHash) { if (!continuationRef || await hash(continuationRef) !== p.continuationHash) return undefined; try { await this.continuation(tx, p.browser, p.continuationHash); } catch { return undefined; } } else if (continuationRef && !p.restart) return undefined;
      const proof = opaque(); const transaction = p.transaction; delete p.transaction;
      await tx.delete(key); await tx.put('activation:v2:' + await hash(proof), await this.seal(p));
      return { transaction, proof, continuation: Boolean(p.continuationHash), standalone: Boolean(p.restart) };
    });
    if (!result) throw new AccessDenied(); return result;
  }
  async discard(proof: string) { handleShape(proof); await this.storage.delete('activation:v2:' + await hash(proof)); }
  async cancelRestart(browser: string, nonce: string, ref?: string) {
    handleShape(browser); handleShape(nonce); if (ref) handleShape(ref);
    return this.storage.transaction(async tx => {
      const browserHash = await hash(browser), ledgerKey = 'browser:v2:' + browserHash, ledger = await tx.get<Ledger>(ledgerKey);
      if (!ledger || ledger.pendingNonce !== nonce) throw new AccessDenied();
      const raw = await tx.get<string>('pending:v2:' + browserHash), pending = raw ? await this.open<Pending>(raw) : undefined;
      const nonceHash = await hash(nonce), retained = ledger.stateBindings?.find(b => b.nonceHash === nonceHash && b.expiresAt > Date.now() && b.restart);
      const proof = pending?.nonce === nonce && pending.expiresAt > Date.now() ? pending : retained;
      const restart = proof?.restart; if (!restart || restart.refHash !== (ref ? await hash(ref) : undefined)) throw new AccessDenied();
      await this.checkRestart(tx, browserHash, restart, ledger);
      if (pending && pending.nonce !== nonce) throw new AccessDenied();
      if (pending) await tx.delete('pending:v2:' + browserHash); delete ledger.pendingNonce; await tx.put(ledgerKey, ledger); return { canceled: true };
    });
  }
  async activate(githubId: number, proof: string) {
    handleShape(proof); const handle = opaque(), key = 'session:v2:' + await hash(handle), proofKey = 'activation:v2:' + await hash(proof);
    let mismatched: { browser: string; refHash: string } | undefined;
    return this.storage.transaction(async tx => {
      const raw = await tx.get<string>(proofKey); if (!raw) throw new AccessDenied(); const p = await this.open<Pending>(raw);
      const ledgerKey = 'browser:v2:' + p.browser, ledger = await tx.get<Ledger>(ledgerKey);
      if (p.version !== 2 || !ledger || ledger.generation !== p.generation || ledger.pendingNonce !== p.nonce || p.expiresAt <= Date.now()) throw new AccessDenied();
      await this.noAccountLease(tx, ledger);
      if (p.restart) await this.checkRestart(tx, p.browser, p.restart, ledger);
      if (p.unbound) await this.checkRestart(tx, p.browser, p.unbound, ledger);
      const identity = await resolveIdentity(tx, githubId), epoch = await this.epoch(tx, identity.subject);
      if (p.continuationHash && p.expected && (p.expected.subject !== identity.subject || p.expected.githubId !== githubId)) mismatched = { browser: p.browser, refHash: p.continuationHash };
      if (epoch.revokedAtSequence > p.sequence || (p.expected && (p.expected.subject !== identity.subject || p.expected.githubId !== githubId || p.expectedEpoch !== epoch.generation))) throw new AccessDenied();
      const cont = p.continuationHash ? await this.continuation(tx, p.browser, p.continuationHash) : undefined;
      if (p.restart?.slotHash) { await this.bump(tx, p.browser, ledger); await tx.delete('continuation:v2:' + p.browser); }
      if (ledger.active) { const oldRaw = await tx.get<string>(ledger.active); if (oldRaw) { const old = await this.open<BrowserSession>(oldRaw); await tx.put(ledger.active, await this.seal({ version: 2, status: 'retired', browser: old.browser, csrf: old.csrf, absoluteUntil: old.absoluteUntil })); } }
      ledger.generation++; ledger.active = key; delete ledger.pendingNonce; const now = Date.now();
      if (cont) { cont.generation = ledger.generation; cont.expected = identity; cont.expectedEpoch = epoch.generation; await this.bump(tx, p.browser, ledger); await tx.put('continuation:v2:' + p.browser, await this.seal(cont)); }
      const session: BrowserSession = { version: 2, identity, createdAt: now, verifiedAt: now, idleUntil: now + 1_800_000, absoluteUntil: now + 28_800_000, generation: ledger.generation, accountEpoch: epoch.generation, browser: p.browser, browserHandle: p.browserHandle, csrf: opaque(), status: 'active' };
      await tx.delete(proofKey); await tx.put(ledgerKey, ledger); await tx.put(key, await this.seal(session)); return { handle, csrf: session.csrf };
    }).catch(async error => { await this.storage.delete(proofKey); if (mismatched) { const target = mismatched; await this.storage.transaction(async tx => { const key = 'continuation:v2:' + target.browser, raw = await tx.get<string>(key); if (raw && (await this.open<Continuation>(raw)).refHash === target.refHash) { await this.bump(tx, target.browser); await tx.delete(key); } }); } throw error; });
  }
  async load(handle: string) { return this.storage.transaction(async tx => (await this.valid(tx, handle)).session); }
  async verify(identity: AccountIdentity) { return this.storage.transaction(async tx => { await verifyIdentity(tx, identity); return identity; }); }
  async csrf(handle: string, nonce: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); if (session.csrf !== nonce) throw new AccessDenied(); session.csrf = opaque(); await tx.put(key, await this.seal(session)); return session; }); }
  async touch(handle: string) { return this.storage.transaction(async tx => { const { key, session } = await this.valid(tx, handle); session.idleUntil = Math.min(Date.now() + 1_800_000, session.absoluteUntil); await tx.put(key, await this.seal(session)); return session; }); }
  async repositoryStartStatus() { try { return { blocked: await this.storage.get(startMarkerKey) !== undefined }; } catch { return { blocked: true }; } }
  async admitRepositoryStart(handle: string, lease: string, purpose: 'account' | 'connector', ref?: string) {
    handleShape(lease); return this.storage.transaction(async tx => {
      // Any persisted value, including corrupt ciphertext, is a fail-closed barrier.
      if (await tx.get(startMarkerKey) !== undefined) throw new AccessDenied();
      const { key, session } = await this.valid(tx, handle), r = session.repositoryState;
      if (!r || r.lease !== lease || r.state !== '' || r.startAttempt || r.expiresAt <= Date.now() || Date.now() - session.verifiedAt > 300000) throw new AccessDenied();
      if (purpose === 'account') { if (ref || r.purpose !== 'account' || r.phase !== 'prepared') throw new AccessDenied(); await this.accountLease(tx, session, lease); }
      else { if (purpose !== 'connector' || r.purpose === 'account' || !ref) throw new AccessDenied(); handleShape(ref); const c = await this.continuation(tx, session.browser, await hash(ref)); if (r.continuationHash !== c.refHash) throw new AccessDenied(); }
      const marker: StartMarker = { version: 1, subject: session.identity.subject, browser: session.browser, generation: session.generation, purpose, lease, attempt: opaque() };
      r.startAttempt = marker.attempt; await tx.put(key, await this.seal(session)); await tx.put(startMarkerKey, await this.seal(marker)); return marker;
    });
  }
  async completeRepositoryStart(marker: StartMarker) { return this.storage.transaction(async tx => {
    const raw = await tx.get<string>(startMarkerKey); if (typeof raw !== 'string' || !raw) throw new AccessDenied(); const stored = await this.open<StartMarker>(raw);
    if (Object.keys(stored).sort().join(',') !== 'attempt,browser,generation,lease,purpose,subject,version' || stored.version !== 1 || !Number.isSafeInteger(stored.generation) || stored.generation < 0 || typeof stored.subject !== 'string' || !stored.subject || !['account', 'connector'].includes(stored.purpose)) throw new AccessDenied();
    for (const key of ['browser', 'lease', 'attempt'] as const) handleShape(stored[key]);
    const keys = ['attempt', 'browser', 'generation', 'lease', 'purpose', 'subject', 'version'] as const;
    if (!marker || Object.keys(marker).sort().join(',') !== keys.join(',') || keys.some(key => stored[key] !== marker[key])) throw new AccessDenied();
    await tx.delete(startMarkerKey);
  }); }
  async prepareConnectorRepository(handle: string, csrf: string, ref: string) { handleShape(ref); return this.storage.transaction(async tx => {
    if (await tx.get(startMarkerKey) !== undefined) throw new AccessDenied();
    const { key, session } = await this.valid(tx, handle); if (session.csrf !== csrf || Date.now() - session.verifiedAt > 300000 || (session.repositoryState && session.repositoryState.expiresAt > Date.now())) throw new AccessDenied();
    const c = await this.continuation(tx, session.browser, await hash(ref)), lease = opaque(); session.repositoryState = { purpose: 'connector', state: '', continuationHash: c.refHash, lease, expiresAt: Math.min(Date.now() + 300000, c.expiresAt) };
    session.csrf = opaque(); await tx.put(key, await this.seal(session)); return { lease };
  }); }
  async prepareAccountRepository(handle: string, csrf: string, ref?: string) { if (ref) handleShape(ref); return this.storage.transaction(async tx => {
    if (await tx.get(startMarkerKey) !== undefined) throw new AccessDenied();
    const { key, session } = await this.valid(tx, handle); if (session.csrf !== csrf || Date.now() - session.verifiedAt > 300000 || (session.repositoryState && session.repositoryState.expiresAt > Date.now())) throw new AccessDenied();
    const ledger = await tx.get<Ledger>('browser:v2:' + session.browser); if (!ledger) throw new AccessDenied(); const refHash = ref ? await hash(ref) : undefined, c = await this.terminal(tx, session.browser, ledger, refHash, refHash === undefined);
    if (c?.expected && (c.expected.subject !== session.identity.subject || c.expected.githubId !== session.identity.githubId || c.expectedEpoch !== session.accountEpoch)) throw new AccessDenied();
    const lease = opaque(); session.repositoryState = { purpose: 'account', lease, state: '', phase: 'prepared', expiresAt: Date.now() + 300000, snapshot: { refHash, slotHash: c?.refHash, revision: this.revision(ledger), generation: session.generation }, subject: session.identity.subject, githubId: session.identity.githubId, accountEpoch: session.accountEpoch };
    session.csrf = opaque(); await tx.put(key, await this.seal(session)); return { lease };
  }); }
  async attachAccountRepository(handle: string, lease: string, state: string) { return this.storage.transaction(async tx => {
    const { key, session } = await this.valid(tx, handle), r = await this.accountLease(tx, session, lease); if (r.phase !== 'prepared' || !state || state.length > 256 || Date.now() - session.verifiedAt > 300000) throw new AccessDenied();
    r.state = state; r.phase = 'awaiting_callback'; await tx.put(key, await this.seal(session)); return { attached: true };
  }); }
  async cancelAccountRepository(handle: string, lease: string, csrf: string) { return this.storage.transaction(async tx => {
    const { key, session } = await this.valid(tx, handle), r = await this.accountLease(tx, session, lease); if (session.csrf !== csrf || r.phase === 'committing') throw new AccessDenied();
    delete session.repositoryState; session.csrf = opaque(); await tx.put(key, await this.seal(session)); return { canceled: true };
  }); }
  async commitAccountRepository(handle: string, lease: string, candidateId: string, finish = false) { return this.storage.transaction(async tx => {
    const { key, session } = await this.valid(tx, handle), r = await this.accountLease(tx, session, lease); if (!candidateId || candidateId.length > 256 || Date.now() - session.verifiedAt > 300000) throw new AccessDenied();
    if (finish) { if (r.phase !== 'committing' || r.candidateId !== candidateId) throw new AccessDenied(); delete session.repositoryState; }
    else { if (r.phase !== 'exchanging') throw new AccessDenied(); r.phase = 'committing'; r.candidateId = candidateId; }
    await tx.put(key, await this.seal(session)); return { accepted: true };
  }); }
  async repositoryCallback(handle: string, state: string, consume = false, continuationRef?: string, lease?: string) { return this.storage.transaction(async tx => {
    const { key, session } = await this.valid(tx, handle); if (!state || state.length > 256) throw new AccessDenied();
    if (consume && session.repositoryState?.purpose === 'account') {
      const r = await this.accountLease(tx, session, session.repositoryState.lease); if (r.phase !== 'awaiting_callback' || r.state !== state) throw new AccessDenied(); r.phase = 'exchanging'; await tx.put(key, await this.seal(session)); return { accepted: true, purpose: 'account' as const, lease: r.lease };
    }
    if (!consume && session.repositoryState && session.repositoryState.expiresAt > Date.now() && (!lease || session.repositoryState.purpose === 'account' || session.repositoryState.lease !== lease || session.repositoryState.state !== '')) throw new AccessDenied();
    if (!consume && lease && (!session.repositoryState || session.repositoryState.purpose === 'account' || session.repositoryState.lease !== lease || session.repositoryState.expiresAt <= Date.now())) throw new AccessDenied();
    const cont = continuationRef ? await this.continuation(tx, session.browser, await hash(continuationRef)) : undefined;
    if (!consume && lease && session.repositoryState?.purpose !== 'account' && session.repositoryState?.continuationHash !== cont?.refHash) throw new AccessDenied();
    if (consume) { if (!session.repositoryState || session.repositoryState.purpose === 'account' || session.repositoryState.state !== state || session.repositoryState.expiresAt <= Date.now() || session.repositoryState.continuationHash !== cont?.refHash) throw new AccessDenied(); delete session.repositoryState; }
    else { if (Date.now() - session.verifiedAt > 300000) throw new AccessDenied(); session.repositoryState = { state, expiresAt: Math.min(Date.now() + 300000, cont?.expiresAt ?? Infinity), ...(cont ? { continuationHash: cont.refHash } : {}) }; }
    await tx.put(key, await this.seal(session)); return { accepted: true, purpose: 'connector' as const };
  }); }
  async signout(handle: string, nonce: string, all = false) {
    handleShape(handle); const key = 'session:v2:' + await hash(handle);
    await this.storage.transaction(async tx => {
      const raw = await tx.get<string>(key); if (!raw) throw new AccessDenied(); const s = await this.open<BrowserSession>(raw);
      if (s.version !== 2 || s.csrf !== nonce || s.absoluteUntil <= Date.now()) throw new AccessDenied();
      if (all) { const active = (await this.valid(tx, handle)).session; const epoch = await this.epoch(tx, active.identity.subject), sequence = (await tx.get<number>('revocation-sequence:v2') ?? 0) + 1; await tx.put('revocation-sequence:v2', sequence); await tx.put('epoch:v2:' + active.identity.subject, { generation: epoch.generation + 1, revokedAtSequence: sequence }); }
      const ledgerKey = 'browser:v2:' + s.browser, ledger = await tx.get<Ledger>(ledgerKey); if (!ledger) throw new AccessDenied();
      if (ledger.active) await tx.delete(ledger.active); ledger.generation++; delete ledger.active; if (await tx.get('continuation:v2:' + s.browser)) await this.bump(tx, s.browser, ledger); await tx.put(ledgerKey, ledger); await tx.delete('pending:v2:' + s.browser); await tx.delete('continuation:v2:' + s.browser); await tx.delete(key);
    });
  }
}
export interface BrowserEnv { BROWSER_SESSION_KEY_HEX: string; BROWSER_SESSION_KEY_ID?: string; BROWSER_SESSION_PREVIOUS_KEYS_JSON?: string; VAULT_KEY_HEX?: string; }
async function repositoryStartSuccess(response: Response, env: AccountEnv) {
  if (response.status !== 200 || response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw new AccessDenied();
  const reader = response.body?.getReader(); if (!reader) throw new AccessDenied(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 8192) throw new AccessDenied(); chunks.push(part.value); } }
  catch (error) { await reader.cancel(); throw error; } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  if (!payload || Object.keys(payload).join(',') !== 'authorizationUrl' || typeof payload.authorizationUrl !== 'string') throw new AccessDenied();
  const url = new URL(payload.authorizationUrl), p = url.searchParams;
  const expected = { client_id: env.GITHUB_CLIENT_ID, redirect_uri: env.GITHUB_CALLBACK, response_type: 'code', scope: 'repo offline_access', code_challenge_method: 'S256' };
  if (url.origin !== 'https://github.com' || url.pathname !== '/login/oauth/authorize' || url.username || url.password || url.hash || [...p.keys()].length !== 7 || [...p.keys()].some(k => ![...Object.keys(expected), 'state', 'code_challenge'].includes(k) || p.getAll(k).length !== 1)) throw new AccessDenied();
  for (const [key, value] of Object.entries(expected)) if (p.get(key) !== value) throw new AccessDenied();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(p.get('state') ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge') ?? '')) throw new AccessDenied();
  return url;
}
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
      const b = JSON.parse(text) as { operation: string; handle: string; activeHandle?: string; nonce: string; state: string; lease: string; transaction: IdentityTransaction; githubId: number; identity: AccountIdentity; consume?: boolean; proof: string; continuationRef?: string; restart?: boolean; ref: string; intent: ContinuationIntent; next: 'awaiting_repository' | 'ready_for_connector' };
      if (b.operation === 'repository-start-status') return Response.json(await store.repositoryStartStatus());
      if (b.operation === 'repository-start') {
        const value = JSON.parse(text) as { handle: string; lease: string; purpose: 'account' | 'connector'; continuationRef?: string; assertion: string };
        return await this.state.blockConcurrencyWhile(async () => {
          try {
            const env = this.env as BrowserEnv & AccountEnv;
            if (env.PRIVATE_ACTIVATION !== 'owner-verified' || typeof value.assertion !== 'string' || !value.assertion) throw new AccessDenied();
            const marker = await store.admitRepositoryStart(value.handle, value.lease, value.purpose, value.continuationRef);
            // Bootstrap already completed outside this gate. This endpoint performs only
            // local GrantDO work; no GitHub request or browser-authority re-entry.
            const result = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(marker.subject)).fetch(new Request(new URL('/oauth/start?purpose=repository', env.ACCOUNT_ISSUER), { method: 'POST', headers: { Authorization: 'Bearer ' + value.assertion, Origin: new URL(env.ACCOUNT_ISSUER).origin }, redirect: 'manual' }));
            const target = await repositoryStartSuccess(result, env);
            // A recognizable complete application result, not HTTP arrival, permits clearing.
            // Clear the exact attempt before attachment; the held gate still excludes events.
            await store.completeRepositoryStart(marker);
            if (value.purpose === 'account') await store.attachAccountRepository(value.handle, value.lease, target.searchParams.get('state')!);
            else await store.repositoryCallback(value.handle, target.searchParams.get('state')!, false, value.continuationRef, value.lease);
            return Response.json({ authorizationUrl: target.toString() });
          } catch { return Response.json({ error: 'repository_start_unavailable', ...await store.repositoryStartStatus() }, { status: 403 }); }
        });
      }
      if (b.operation === 'commit-repository' || b.operation === 'commit-connector') {
        const value = JSON.parse(text) as { operation: string; handle: string; proof: BrowserGrantProof; candidateId?: string; assertion: string; authorizationUrl?: string; continuationRef?: string; lease?: string };
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
              if (value.lease) { if (value.continuationRef) throw new AccessDenied(); await store.commitAccountRepository(value.handle, value.lease, value.candidateId!); }
              else if (session.repositoryState?.purpose === 'account') throw new AccessDenied();
              const committed = await env.ACCOUNT_GRANTS.get(env.ACCOUNT_GRANTS.idFromName(session.identity.subject)).fetch(new Request('https://internal.invalid/internal/grant/commit', { method: 'POST', headers: { Authorization: 'Bearer ' + value.assertion }, body: JSON.stringify({ candidateId: value.candidateId, browser: proof }) }));
              if (!committed.ok) throw new AccessDenied(); if (value.lease) await store.commitAccountRepository(value.handle, value.lease, value.candidateId!, true); return Response.json(await committed.json());
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
      if (b.operation === 'begin') return Response.json(await store.begin(b.handle, b.activeHandle, b.continuationRef, b.restart === true));
      if (b.operation === 'entry') return Response.json(await store.entry(b.handle, b.activeHandle, b.continuationRef));
      if (b.operation === 'restart-cancel') return Response.json(await store.cancelRestart(b.handle, b.nonce, b.continuationRef));
      if (b.operation === 'start') return Response.json(await store.start(b.handle, b.nonce, b.transaction, b.continuationRef, b.restart === true));
      if (b.operation === 'consume') return Response.json(await store.consume(b.handle, b.nonce, b.state, b.continuationRef));
      if (b.operation === 'activate') return Response.json(await store.activate(b.githubId, b.proof));
      if (b.operation === 'discard') { await store.discard(b.proof); return Response.json({ discarded: true }); }
      if (b.operation === 'verify') return Response.json(await store.verify(b.identity));
      if (b.operation === 'repository-state') return Response.json(await store.repositoryCallback(b.handle, b.nonce, b.consume, b.continuationRef, b.lease));
      if (b.operation === 'repository-connector-prepare') return Response.json(await store.prepareConnectorRepository(b.handle, b.nonce, b.continuationRef!));
      if (b.operation === 'repository-account-prepare') return Response.json(await store.prepareAccountRepository(b.handle, b.nonce, b.continuationRef));
      if (b.operation === 'repository-account-attach') return Response.json(await store.attachAccountRepository(b.handle, b.lease, b.state));
      if (b.operation === 'repository-account-cancel') return Response.json(await store.cancelAccountRepository(b.handle, b.lease, b.nonce));
      if (b.operation === 'touch') return Response.json(await store.touch(b.handle));
      if (b.operation === 'load') return Response.json(await store.load(b.handle));
      if (b.operation === 'csrf') return Response.json(await store.csrf(b.handle, b.nonce));
      if (b.operation === 'signout' || b.operation === 'revoke-all-local-browser-sessions') { await store.signout(b.handle, b.nonce, b.operation !== 'signout'); return Response.json({ invalidated: true }); }
      throw new AccessDenied();
    } catch { return Response.json({ error: 'access_denied' }, { status: 403 }); }
  }
}
