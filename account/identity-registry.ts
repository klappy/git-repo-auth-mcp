import { AccessDenied, positiveInteger } from './session';
export interface AccountIdentity { subject: string; githubId: number; }
export const IDENTITY_ISSUER = 'https://github.com';
/** Caller owns the transaction, so session issuance and both immutable indexes commit together. */
export async function resolveIdentity(tx: DurableObjectTransaction, githubId: number): Promise<AccountIdentity> {
  if (!positiveInteger(githubId)) throw new AccessDenied();
  const reverse = 'identity:v2:' + IDENTITY_ISSUER + ':' + githubId;
  let subject = await tx.get<string>(reverse);
  if (subject !== undefined) {
    if (typeof subject !== 'string' || !/^acct_[a-f0-9-]{36}$/.test(subject)) throw new AccessDenied();
    if (await tx.get('identity:v2:subject:' + subject) !== githubId) throw new AccessDenied();
  } else {
    // A partial restore must not silently assign a new subject to an existing numeric identity.
    // Complete first-slice scan; capacity exhaustion denies rather than treating partial coverage as absence.
    const forwards = await tx.list<number>({ prefix: 'identity:v2:subject:', limit: 10001 });
    if (forwards.size >= 10001 || [...forwards.values()].some(id => !positiveInteger(id) || id === githubId)) throw new AccessDenied();
    subject = 'acct_' + crypto.randomUUID();
    if (await tx.get('identity:v2:subject:' + subject) !== undefined) throw new AccessDenied();
    await tx.put({ [reverse]: subject, ['identity:v2:subject:' + subject]: githubId });
  }
  return { subject, githubId };
}
export async function verifyIdentity(tx: DurableObjectTransaction, identity: AccountIdentity) {
  validateIdentity(identity);
  if (await tx.get('identity:v2:subject:' + identity.subject) !== identity.githubId || await tx.get('identity:v2:' + IDENTITY_ISSUER + ':' + identity.githubId) !== identity.subject) throw new AccessDenied();
}
export function validateIdentity(value: AccountIdentity): void {
  if (!value || typeof value.subject !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(value.subject) || !positiveInteger(value.githubId)) throw new AccessDenied();
}
/** One authoritative object owns both indexes in the SAME transaction. No email keys. */
export class IdentityRegistry {
  constructor(private storage: DurableObjectStorage) {}
  async bind(identity: AccountIdentity) {
    validateIdentity(identity);
    return this.storage.transaction(async tx => {
      const a = 'subject:' + identity.subject, b = 'github:' + identity.githubId;
      const [id, subject] = await Promise.all([tx.get<number>(a), tx.get<string>(b)]);
      if ((id !== undefined && id !== identity.githubId) || (subject !== undefined && subject !== identity.subject) || (id === undefined) !== (subject === undefined)) throw new AccessDenied();
      if (id === undefined) await tx.put({ [a]: identity.githubId, [b]: identity.subject });
      return { ...identity };
    });
  }
  async verify(identity: AccountIdentity) {
    validateIdentity(identity);
    return this.storage.transaction(async tx => {
      if (await tx.get('subject:' + identity.subject) !== identity.githubId || await tx.get('github:' + identity.githubId) !== identity.subject) throw new AccessDenied();
      return { ...identity };
    });
  }
}
/** Binding-only internal API. The public worker never forwards caller identity payloads here. */
export class AccountIdentityRegistry implements DurableObject {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    try {
      if (request.method !== 'POST') throw new AccessDenied();
      const value = await request.json() as { operation: string; identity: AccountIdentity };
      const registry = new IdentityRegistry(this.state.storage);
      if (value.operation === 'bind') return Response.json(await registry.bind(value.identity));
      if (value.operation === 'verify') return Response.json(await registry.verify(value.identity));
      throw new AccessDenied();
    } catch { return Response.json({ error: 'access_denied' }, { status: 403 }); }
  }
}
