import { GitHubOAuth, type IdentityTransaction, type OAuthConfig } from './oauth';
export interface LoginAdapter {
  begin(): Promise<{ url: string; transaction: IdentityTransaction }>;
  complete(input: { url: URL; transaction: IdentityTransaction }): Promise<{ githubId: number }>;
}
/** Production uses only this fixed GitHub adapter; synthetic adapters are module-internal fixtures. */
export function productionLogin(config: OAuthConfig): LoginAdapter {
  const github = new GitHubOAuth(config);
  return { begin: () => github.startIdentity(), complete: input => github.completeIdentity(input.url, input.transaction) };
}
