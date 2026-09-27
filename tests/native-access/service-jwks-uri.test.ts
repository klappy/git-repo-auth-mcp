import { describe, it, expect, beforeEach } from 'vitest';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK } from 'jose';
import { serviceKeyResolver, resetServiceJwksCache, jwksUriAllowed, parsePublishedJwks, JWKS_TTL_MS, UNKNOWN_KID_REFETCH_MS } from '../../account/service-jwks';

const ISS = 'https://cartographer-staging.klappy.dev', AUD = 'https://account-staging.klappy.dev/read', URI = ISS + '/.well-known/jwks.json';
async function pair(kid: string) { const k = await generateKeyPair('ES256', { extractable: true }); const pub = { ...(await exportJWK(k.publicKey)), kid, alg: 'ES256', use: 'sig' } as JWK; return { priv: k.privateKey, pub, fullPriv: { ...(await exportJWK(k.privateKey)), kid } }; }
const sign = (priv: CryptoKey, kid: string, extra: Record<string, unknown> = {}) => new SignJWT({ resource: ISS + '/mcp' }).setProtectedHeader({ alg: 'ES256', kid, ...extra }).setIssuer(ISS).setAudience(AUD).setSubject('cartographer').setIssuedAt().setExpirationTime('5m').sign(priv);
const verify = (t: string, key: unknown) => jwtVerify(t, key as never, { issuer: ISS, audience: AUD, algorithms: ['ES256'] });
function fetcher(bodies: () => unknown, status = 200) { const calls: RequestInit[] = []; const f = async (_u: string, init: RequestInit) => { calls.push(init); return new Response(JSON.stringify(bodies()), { status }); }; return { f, calls }; }

describe('service jwks_uri trust', () => {
  beforeEach(() => resetServiceJwksCache());
  it('without SERVICE_JWKS_URI the pasted key path is unchanged and never fetches', async () => {
    const pasted = await pair('pasted'), other = await pair('self'); const { f, calls } = fetcher(() => ({ keys: [other.pub] }));
    const key = serviceKeyResolver({ SERVICE_JWKS: JSON.stringify({ keys: [pasted.pub] }), SERVICE_ISSUER: ISS }, f);
    await expect(verify(await sign(pasted.priv, 'pasted'), key)).resolves.toBeTruthy();
    await expect(verify(await sign(other.priv, 'self'), key)).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
  it('trusts pasted and published keys in parallel; pasted never fetches', async () => {
    const pasted = await pair('pasted'), self = await pair('self'); const { f, calls } = fetcher(() => ({ keys: [self.pub] }));
    const key = serviceKeyResolver({ SERVICE_JWKS: JSON.stringify({ keys: [pasted.pub] }), SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, f);
    await expect(verify(await sign(pasted.priv, 'pasted'), key)).resolves.toBeTruthy();
    expect(calls.length).toBe(0);
    await expect(verify(await sign(self.priv, 'self'), key)).resolves.toBeTruthy();
    expect(calls[0].redirect).toBe('manual');
  });
  it('caches for the TTL and refetches once per window on unknown kid', async () => {
    const a = await pair('a'), b = await pair('b'); let keys = [a.pub]; let t = 0; const { f, calls } = fetcher(() => ({ keys }));
    const key = serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, f, () => t);
    await verify(await sign(a.priv, 'a'), key); await verify(await sign(a.priv, 'a'), key); expect(calls.length).toBe(1);
    keys = [a.pub, b.pub]; t = 1000;
    await expect(verify(await sign(b.priv, 'b'), key)).rejects.toThrow(); expect(calls.length).toBe(1); // rate-limited
    t = UNKNOWN_KID_REFETCH_MS; await expect(verify(await sign(b.priv, 'b'), key)).resolves.toBeTruthy(); expect(calls.length).toBe(2);
    t = UNKNOWN_KID_REFETCH_MS + JWKS_TTL_MS; await verify(await sign(a.priv, 'a'), key); expect(calls.length).toBe(3);
  });
  it('fails closed on redirect, error status, network error, and bad sets', async () => {
    const s = await pair('s');
    for (const status of [301, 302, 404, 500]) { resetServiceJwksCache(); const { f } = fetcher(() => ({ keys: [s.pub] }), status); await expect(verify(await sign(s.priv, 's'), serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, f))).rejects.toThrow(); }
    const boom = async () => { throw new Error('net'); };
    await expect(verify(await sign(s.priv, 's'), serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, boom))).rejects.toThrow();
    const { f } = fetcher(() => ({ keys: [s.fullPriv] }));
    await expect(verify(await sign(s.priv, 's'), serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, f))).rejects.toThrow();
  });
  it('rejects jku/x5u headers on the published path', async () => {
    const s = await pair('s'); const { f, calls } = fetcher(() => ({ keys: [s.pub] }));
    const key = serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: URI, SERVICE_ISSUER: ISS }, f);
    await expect(verify(await sign(s.priv, 's', { jku: 'https://evil.example/jwks' }), key)).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
  it('pins uri to https and the issuer origin; misconfig disables remote trust', async () => {
    expect(jwksUriAllowed(URI, ISS)).toBeTruthy();
    for (const bad of ['http://cartographer-staging.klappy.dev/.well-known/jwks.json', 'https://evil.klappy.dev/.well-known/jwks.json', URI + '?x=1', 'https://u:p@cartographer-staging.klappy.dev/j', 'nope']) expect(jwksUriAllowed(bad, ISS)).toBeUndefined();
    const s = await pair('s'); const { f, calls } = fetcher(() => ({ keys: [s.pub] }));
    await expect(verify(await sign(s.priv, 's'), serviceKeyResolver({ SERVICE_JWKS: '{"keys":[]}', SERVICE_JWKS_URI: 'https://evil.example/jwks.json', SERVICE_ISSUER: ISS }, f))).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
  it('accepts only ≤8 ES256 P-256 public keys', async () => {
    const s = await pair('s'); const k = (i: number) => ({ ...s.pub, kid: 'k' + i });
    expect(parsePublishedJwks({ keys: Array.from({ length: 8 }, (_, i) => k(i)) }).size).toBe(8);
    for (const bad of [{ keys: Array.from({ length: 9 }, (_, i) => k(i)) }, { keys: [] }, { keys: [{ ...s.pub, crv: 'P-384' }] }, { keys: [{ ...s.pub, alg: 'RS256' }] }, { keys: [{ ...s.pub, kty: 'RSA' }] }, { keys: [{ ...s.pub, x5u: 'https://x' }] }, { keys: [{ ...s.pub, jku: 'https://x' }] }, { keys: [s.fullPriv] }, { keys: [{ ...s.pub, kid: undefined }] }, { keys: [s.pub, s.pub] }])
      expect(() => parsePublishedJwks(bad)).toThrow();
  });
});
