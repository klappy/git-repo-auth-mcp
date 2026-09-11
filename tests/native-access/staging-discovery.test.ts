import { expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ WorkerEntrypoint: class {} }));
import worker, { type AccountEnv } from '../../account/broker';
const origin = 'https://account-staging.klappy.dev';
const resource = 'https://cartographer-staging.klappy.dev/mcp';
const ctx = {} as ExecutionContext;
function env(mode: string | undefined = 'enabled') {
  const config: Record<string, unknown> = { PRIVATE_ACTIVATION: 'disabled', STAGING_METADATA_DISCOVERY: mode, ACCOUNT_ISSUER: origin, RESOURCE: resource };
  return new Proxy(config, { get(target, property) {
    if (typeof property === 'string' && (property.includes('KEY') || property.includes('SECRET') || property.includes('KV') || property.includes('GRANTS') || property.includes('SESSIONS') || property.includes('REGISTRY') || property === 'OAUTH_PROVIDER')) throw new Error('forbidden state access');
    return target[property as string];
  } }) as unknown as AccountEnv;
}
it('serves maintained S256 metadata with no credentials or storage bindings', async () => {
  const r = await worker.fetch(new Request(origin + '/.well-known/oauth-authorization-server'), env(), ctx);
  expect(r.status).toBe(200); expect(r.headers.get('Cache-Control')).toBe('no-store');
  const body = await r.json() as any;
  expect(body.issuer).toBe(origin); expect(body.authorization_endpoint).toBe(origin + '/authorize'); expect(body.token_endpoint).toBe(origin + '/token');
  expect(body.code_challenge_methods_supported).toEqual(['S256']); expect(body.registration_endpoint).toBeUndefined(); expect(body.client_id_metadata_document_supported).toBe(false);
  expect(body.authorization_response_iss_parameter_supported).toBeUndefined();
  const protectedResource = await worker.fetch(new Request(origin + '/.well-known/oauth-protected-resource'), env(), ctx);
  expect(protectedResource.status).toBe(200); expect(await protectedResource.json()).toMatchObject({ resource, authorization_servers: [origin] });
});
it.each(['POST', 'OPTIONS', 'HEAD'])('discovery rejects %s before reaching maintained provider', async method => {
  expect((await worker.fetch(new Request(origin + '/.well-known/oauth-authorization-server', { method }), env(), ctx)).status).toBe(403);
});
it.each(['https://wrong.invalid/.well-known/oauth-authorization-server', origin + '/.well-known/oauth-authorization-server?callback=bad', origin + '/.well-known/oauth-authorization-server?', origin + '/.well-known/oauth-protected-resource?'])('discovery rejects wrong origin or query: %s', async url => {
  expect((await worker.fetch(new Request(url), env(), ctx)).status).toBe(403);
});
it.each(['/.well-known/oauth-authorization-server/', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource/', '/.well-known/%6fauth-authorization-server'])('does not broaden exact metadata paths: %s', async path => {
  expect((await worker.fetch(new Request(origin + path), env(), ctx)).status).toBeGreaterThanOrEqual(400);
});
it.each(['off', ''])('metadata requires explicit mode %s', async mode => {
  expect((await worker.fetch(new Request(origin + '/.well-known/oauth-authorization-server'), env(mode), ctx)).status).toBe(403);
});
it.each(['/authorize', '/token', '/connector/session', '/oauth/start', '/oauth/callback', '/read'])('discovery cannot activate %s', async path => {
  const r = await worker.fetch(new Request(origin + path), env(), ctx);
  expect(r.status).toBeGreaterThanOrEqual(400); expect(r.headers.get('Location')).toBeNull();
});
