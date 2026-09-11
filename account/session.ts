import { jwtVerify, type JWTVerifyGetKey, type CryptoKey, type KeyObject, type JWK } from 'jose';

export type VerificationKey = CryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey;
export interface SessionPolicy {
  accountIssuer: string; serviceIssuer: string; audience: string; resource: string;
  service: string; accountKey: VerificationKey; serviceKey: VerificationKey;
}
export interface SessionContext {
  subject: string; githubId: number; service: string; resource: string; generation: number;
}
export class AccessDenied extends Error { constructor() { super('access_denied'); } }
export const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
async function claims(token: string, key: VerificationKey, issuer: string, audience: string) {
  if (!token || token.length > 8192) throw new AccessDenied();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key as JWTVerifyGetKey, {
      issuer, audience, algorithms: ['ES256'], requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '5 minutes',
    }));
  } catch { throw new AccessDenied(); }
  if (payload.aud !== audience || !payload.sub || payload.exp! - payload.iat! > 300) throw new AccessDenied();
  return payload;
}
export async function verifyAccount(token: string, policy: SessionPolicy): Promise<SessionContext> {
  const c = await claims(token, policy.accountKey, policy.accountIssuer, policy.audience);
  if (c.resource !== policy.resource || c.service !== policy.service || !positiveInteger(c.github_id) || !positiveInteger(c.grant_generation)) throw new AccessDenied();
  return Object.freeze({ subject: c.sub!, githubId: c.github_id, service: c.service, resource: c.resource, generation: c.grant_generation });
}
export async function verifySession(userToken: string, serviceToken: string, policy: SessionPolicy): Promise<SessionContext> {
  // Verify both assertions before any grant selection or provider request.
  const [user, service] = await Promise.all([verifyAccount(userToken, policy), claims(serviceToken, policy.serviceKey, policy.serviceIssuer, policy.audience)]);
  if (service.sub !== user.service || service.resource !== user.resource) throw new AccessDenied();
  return user;
}
export function bearer(value: string | null): string {
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value ?? '');
  if (!match) throw new AccessDenied();
  return match[1];
}
