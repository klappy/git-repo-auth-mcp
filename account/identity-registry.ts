import { AccessDenied, positiveInteger } from './session';
export interface AccountIdentity { subject: string; githubId: number; }
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
