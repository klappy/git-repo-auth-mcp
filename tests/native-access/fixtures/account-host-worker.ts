/** Localhost-only synthetic control wrapper. Never imported by the production account entrypoint. */
import worker, { AccountGrantObject, type AccountEnv } from '../../../account/broker';
export { AccountGrantObject };
const counts = { exchange: 0, refresh: 0, identity: 0, unexpected: 0 };
// No fallback to native fetch: all provider egress terminates inside this fixture.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init?.headers);
  if (url.href === 'https://github.com/login/oauth/access_token') {
    const form = new URLSearchParams(String(init?.body));
    const refreshing = form.get('grant_type') === 'refresh_token';
    const descriptor = refreshing ? form.get('refresh_token') ?? '' : form.get('code') ?? '';
    const match = /(?:INERT_REFRESH_)?(100[12])_(normal|short|crash|wrong)(?:_(\d+))?$/.exec(descriptor);
    if (!match || (init?.method ?? 'GET') !== 'POST') throw new Error('fixture rejected token request');
    const [, id, mode] = match, serial = refreshing ? Number(match[3] ?? 0) + 1 : 0;
    if (refreshing) counts.refresh++; else counts.exchange++;
    if (refreshing && mode === 'crash') await new Promise(resolve => setTimeout(resolve, 120_000));
    return Response.json({ access_token: `INERT_ACCESS_${id}_${mode}_${serial}`, token_type: 'bearer', scope: 'repo', expires_in: !refreshing && mode !== 'normal' ? 1 : 3600, refresh_token: `INERT_REFRESH_${id}_${mode}_${serial}`, refresh_token_expires_in: 7200 });
  }
  if (url.href === 'https://api.github.com/user') {
    counts.identity++;
    const match = /^Bearer INERT_ACCESS_(100[12])_(normal|short|crash|wrong)_(\d+)$/.exec(headers.get('Authorization') ?? '');
    if (!match) throw new Error('fixture rejected identity');
    return Response.json({ id: match[2] === 'wrong' && Number(match[3]) > 0 ? 9999 : Number(match[1]) }, { headers: { 'x-oauth-scopes': 'repo' } });
  }
  if (url.href === 'https://api.github.com/repos/personal/same-name' && (init?.method ?? 'GET') === 'GET') {
    if (!/^Bearer INERT_ACCESS_1001_/.test(headers.get('Authorization') ?? '')) return Response.json({}, { status: 404 });
    return Response.json({ id: 2001, full_name: 'personal/same-name', default_branch: 'main', private: true });
  }
  if (url.href === 'https://api.github.com/repos/personal/same-name/commits/main' && (init?.method ?? 'GET') === 'GET' && /^Bearer INERT_ACCESS_1001_/.test(headers.get('Authorization') ?? '')) return Response.json({ sha: 'a'.repeat(40), commit: { tree: { sha: 'b'.repeat(40) } } });
  counts.unexpected++;
  throw new Error('fixture denied unlisted provider destination');
}) as typeof fetch;
export default {
  async fetch(request: Request, env: AccountEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/__fixture/stats') return Response.json(counts);
    if (url.pathname === '/__fixture/seed-client' && request.method === 'POST') {
      await env.ACCOUNT_CONNECTOR_KV!.put('client:synthetic-native-client', JSON.stringify({ clientId: 'synthetic-native-client', redirectUris: ['https://client.example.test/callback'], clientName: 'Synthetic host client', tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] }));
      return Response.json({ seeded: true });
    }
    // Exact synthetic HTTPS callback/issuer required by production OAuth; localhost is transport only.
    const target = new URL(url.pathname + url.search, env.ACCOUNT_ISSUER);
    return worker.fetch(new Request(target, request), env, ctx);
  },
} satisfies ExportedHandler<AccountEnv>;
