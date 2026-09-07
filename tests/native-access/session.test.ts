import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { verifySession, bearer } from '../../account/session';
import { assertions, context } from './helpers';
describe('verified account and service assertions', () => {
  it('accepts exact asymmetric issuer/audience/resource/service binding', async () => { const a = await assertions(); expect(await verifySession(await a.user(), await a.machine(), a.policy)).toEqual(context); });
  it.each([{ resource: 'https://navigator.example.test/other' }, { service: 'other-service' }, { github_id: '1001' }, { github_id: -1 }, { grant_generation: 0 }])('denies malformed user claims %j', async change => { const a = await assertions(); await expect(verifySession(await a.user(change), await a.machine(), a.policy)).rejects.toThrow(); });
  it.each(['accountIssuer','serviceIssuer','audience','resource','service'] as const)('denies wrong policy %s', async field => { const a = await assertions(); await expect(verifySession(await a.user(), await a.machine(), { ...a.policy, [field]: 'wrong' })).rejects.toThrow(); });
  it('denies a service-only request and wrong service resource', async () => { const a = await assertions(); await expect(verifySession('', await a.machine(), a.policy)).rejects.toThrow(); await expect(verifySession(await a.user(), await a.machine({ resource: 'other' }), a.policy)).rejects.toThrow(); });
  it('denies expiry and multi audience even if expected audience is present', async () => { const a = await assertions(); for (const expired of [true, false]) { const token = await new SignJWT({ github_id:1001, service:context.service, resource:context.resource, grant_generation:1 }).setProtectedHeader({alg:'ES256'}).setSubject('acct-A').setIssuer(a.policy.accountIssuer).setAudience(expired ? a.policy.audience : [a.policy.audience,'other']).setIssuedAt().setExpirationTime(expired ? '-1s' : '5m').sign(a.account.privateKey); await expect(verifySession(token,await a.machine(),a.policy)).rejects.toThrow(); } });
  it('rejects malformed bearer syntax', () => { expect(() => bearer('Basic secret')).toThrow(); });
});
