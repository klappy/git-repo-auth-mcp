import { createLocalJWKSet, importJWK, type JSONWebKeySet, type JWK, type JWSHeaderParameters, type FlattenedJWSInput } from 'jose';
import { AccessDenied, type VerificationKey } from './session';

/**
 * Service key trust. The pasted SERVICE_JWKS is always trusted exactly as before.
 * When SERVICE_JWKS_URI is configured, keys published by the service at that URL are
 * trusted in parallel (kitchen PLAN §5): https only, same origin as SERVICE_ISSUER,
 * no redirects, ≤8 keys, ES256/P-256 public keys only, 5-minute cache, one
 * rate-limited refetch on unknown kid, and every failure denies.
 */
export const JWKS_TTL_MS = 5 * 60_000;
export const UNKNOWN_KID_REFETCH_MS = 60_000;
export const MAX_KEYS = 8;
const MAX_BYTES = 16_384;
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
interface Cache { keys: Map<string, JWK>; fetchedAt: number; lastRefetch: number; }
const caches = new Map<string, Cache>();
export function resetServiceJwksCache() { caches.clear(); }

export function jwksUriAllowed(uri: string | undefined, issuer: string): URL | undefined {
  try {
    const u = new URL(uri ?? ''), i = new URL(issuer);
    if (u.protocol !== 'https:' || i.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.origin !== i.origin) return undefined;
    return u;
  } catch { return undefined; }
}

export function parsePublishedJwks(body: unknown): Map<string, JWK> {
  const keys = (body as { keys?: unknown })?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS) throw new AccessDenied();
  const out = new Map<string, JWK>();
  for (const k of keys as Record<string, unknown>[]) {
    if (!k || typeof k !== 'object') throw new AccessDenied();
    if ('d' in k || 'jku' in k || 'x5u' in k || 'x5c' in k || 'k' in k) throw new AccessDenied();
    if (k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string' || typeof k.kid !== 'string' || !k.kid) throw new AccessDenied();
    if (k.alg !== undefined && k.alg !== 'ES256') throw new AccessDenied();
    if (k.use !== undefined && k.use !== 'sig') throw new AccessDenied();
    if (out.has(k.kid)) throw new AccessDenied();
    out.set(k.kid, { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, kid: k.kid, alg: 'ES256' });
  }
  return out;
}

async function load(uri: string, fetcher: Fetcher): Promise<Map<string, JWK>> {
  let res: Response;
  try { res = await fetcher(uri, { redirect: 'manual', headers: { Accept: 'application/json' } }); } catch { throw new AccessDenied(); }
  if (res.status !== 200 || res.redirected) throw new AccessDenied();
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new AccessDenied();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AccessDenied(); }
  return parsePublishedJwks(body);
}

export function serviceKeyResolver(env: { SERVICE_JWKS: string; SERVICE_JWKS_URI?: string; SERVICE_ISSUER: string }, fetcher: Fetcher = (i, n) => fetch(i, n), now: () => number = Date.now): VerificationKey {
  const local = createLocalJWKSet(JSON.parse(env.SERVICE_JWKS) as JSONWebKeySet);
  if (env.SERVICE_JWKS_URI === undefined || env.SERVICE_JWKS_URI === '') return local; // pasted-key path, unchanged
  const uri = jwksUriAllowed(env.SERVICE_JWKS_URI, env.SERVICE_ISSUER)?.toString();
  return async (header: JWSHeaderParameters, token: FlattenedJWSInput) => {
    try { return await local(header, token); } catch (localError) {
      if (!uri) throw localError; // misconfigured URI: remote trust disabled, fail closed
      const h = header as Record<string, unknown>;
      if (header.alg !== 'ES256' || typeof header.kid !== 'string' || 'jku' in h || 'x5u' in h || 'jwk' in h || 'x5c' in h) throw new AccessDenied();
      const t = now();
      let c = caches.get(uri);
      if (!c || t - c.fetchedAt >= JWKS_TTL_MS) {
        caches.delete(uri);
        c = { keys: await load(uri, fetcher), fetchedAt: t, lastRefetch: t };
        caches.set(uri, c);
      } else if (!c.keys.has(header.kid) && t - c.lastRefetch >= UNKNOWN_KID_REFETCH_MS) {
        c.lastRefetch = t;
        c = { keys: await load(uri, fetcher), fetchedAt: t, lastRefetch: t };
        caches.set(uri, c);
      }
      const jwk = c.keys.get(header.kid);
      if (!jwk) throw new AccessDenied();
      return importJWK(jwk, 'ES256');
    }
  };
}
