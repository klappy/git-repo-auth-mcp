import * as oauth from 'oauth4webapi';
import { AccessDenied, positiveInteger, type SessionContext } from './session';

export interface ProviderCredential {
  accessToken: string; refreshToken: string; expiresAt: number; refreshExpiresAt: number;
  scopes: string[]; githubId: number;
}
export interface OAuthTransaction {
  state: string; verifier: string; subject: string; githubId: number; resource: string;
  callback: string; purpose: 'identity' | 'repository'; expiresAt: number; generation: number;
}
export interface TransactionStore {
  put(transaction: OAuthTransaction): Promise<void>;
  take(state: string): Promise<OAuthTransaction | undefined>;
}
export interface OAuthConfig { clientId: string; clientSecret: string; callback: string; fetch: typeof fetch; }
const server: oauth.AuthorizationServer = { issuer: 'https://github.com', authorization_endpoint: 'https://github.com/login/oauth/authorize', token_endpoint: 'https://github.com/login/oauth/access_token' };
export function normalizedScopes(scope: unknown): string[] {
  if (typeof scope !== 'string') throw new AccessDenied();
  return [...new Set(scope.split(/[ ,]+/).filter(Boolean))].sort();
}
export function validateScopes(scope: unknown, purpose: OAuthTransaction['purpose']): string[] {
  const scopes = normalizedScopes(scope);
  const allowed = purpose === 'repository' ? ['repo'] : ['read:user'];
  // Missing, inherited or unexpected provider privileges are rejected, never silently adopted.
  if (scopes.length !== allowed.length || scopes.some((s, i) => s !== allowed[i])) throw new AccessDenied();
  return scopes;
}
export class GitHubOAuth {
  private client: oauth.Client;
  constructor(private config: OAuthConfig) {
    if (new URL(config.callback).protocol !== 'https:') throw new AccessDenied();
    this.client = { client_id: config.clientId };
  }
  async start(context: SessionContext, purpose: OAuthTransaction['purpose'], store: TransactionStore) {
    if (purpose !== 'identity' && purpose !== 'repository') throw new AccessDenied();
    const state = oauth.generateRandomState(), verifier = oauth.generateRandomCodeVerifier();
    const transaction: OAuthTransaction = { state, verifier, subject: context.subject, githubId: context.githubId, resource: context.resource, callback: this.config.callback, purpose, generation: context.generation, expiresAt: Date.now() + 300_000 };
    await store.put(transaction);
    const url = new URL(server.authorization_endpoint!);
    url.search = new URLSearchParams({ client_id: this.client.client_id, redirect_uri: transaction.callback, response_type: 'code', scope: purpose === 'repository' ? 'repo' : 'read:user', state, code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
    return url.toString();
  }
  async callback(url: URL, context: SessionContext, store: TransactionStore): Promise<{ credential: ProviderCredential | null; generation: number }> {
    // Burn the one-use transaction even on a failed or confused callback.
    const state = url.searchParams.get('state');
    if (!state) throw new AccessDenied();
    const tx = await store.take(state);
    if (!tx || tx.expiresAt <= Date.now() || tx.subject !== context.subject || tx.githubId !== context.githubId || tx.resource !== context.resource || tx.generation !== context.generation || tx.callback !== this.config.callback || url.origin + url.pathname !== tx.callback) throw new AccessDenied();
    const params = oauth.validateAuthResponse(server, this.client, url, tx.state);
    const response = await oauth.authorizationCodeGrantRequest(server, this.client, oauth.ClientSecretPost(this.config.clientSecret), params, tx.callback, tx.verifier, { [oauth.customFetch]: this.config.fetch });
    const result = await oauth.processAuthorizationCodeResponse(server, this.client, response);
    const scopes = validateScopes(result.scope, tx.purpose);
    const githubId = await this.identity(result.access_token, scopes);
    if (githubId !== context.githubId) throw new AccessDenied();
    if (tx.purpose === 'identity') return { credential: null, generation: tx.generation };
    return { credential: this.credential(result, githubId, scopes), generation: tx.generation };
  }
  async refresh(old: ProviderCredential): Promise<ProviderCredential> {
    if (old.refreshExpiresAt <= Date.now()) throw new AccessDenied();
    const response = await oauth.refreshTokenGrantRequest(server, this.client, oauth.ClientSecretPost(this.config.clientSecret), old.refreshToken, { [oauth.customFetch]: this.config.fetch });
    const result = await oauth.processRefreshTokenResponse(server, this.client, response);
    const scopes = validateScopes(result.scope, 'repository');
    const id = await this.identity(result.access_token, scopes);
    if (id !== old.githubId || result.refresh_token === old.refreshToken) throw new AccessDenied();
    return this.credential(result, id, scopes);
  }
  private credential(result: oauth.TokenEndpointResponse, githubId: number, scopes: string[]): ProviderCredential {
    if (!positiveInteger(result.expires_in) || !positiveInteger(result.refresh_token_expires_in) || typeof result.refresh_token !== 'string' || !result.refresh_token) throw new AccessDenied();
    return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000, refreshExpiresAt: Date.now() + result.refresh_token_expires_in * 1000, scopes, githubId };
  }
  private async identity(token: string, expectedScopes: string[]) {
    const r = await this.config.fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'native-account-broker' }, redirect: 'error' });
    if (!r.ok || normalizedScopes(r.headers.get('x-oauth-scopes')).join(' ') !== expectedScopes.join(' ')) throw new AccessDenied();
    const user = await r.json() as { id?: unknown };
    if (!positiveInteger(user.id)) throw new AccessDenied();
    return user.id;
  }
}
