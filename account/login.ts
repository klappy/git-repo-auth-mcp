import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { AccessDenied } from './session';
import { projectManaged, type ManagedTokens } from './browser-session';
import type { AccountIdentity } from './identity-registry';
/** Provider-bearing SDK session writes stay request-local and are projected BEFORE serialization. */
export class QuarantinedSdkStorage implements SupportedStorage {
  private staged = new Map<string, string>();
  constructor(private verifierStore: SupportedStorage) {}
  async getItem(key: string) { return this.staged.get(key) ?? await this.verifierStore.getItem(key); }
  async setItem(key: string, value: string) {
    if (key.endsWith('-code-verifier')) { const v = JSON.parse(value); const valid = key.endsWith('-flows-code-verifier') ? Array.isArray(v) && v.length <= 10 && v.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)) : typeof v === 'string' && v.length <= 512; if (!valid) throw new AccessDenied(); await this.verifierStore.setItem(key, JSON.stringify(v)); return; }
    this.staged.set(key, JSON.stringify(projectManaged(JSON.parse(value))));
  }
  async removeItem(key: string) { this.staged.delete(key); await this.verifierStore.removeItem(key); }
  discard() { this.staged.clear(); }
}
export function managedSdk(url: string, publishableKey: string, storage: QuarantinedSdkStorage, transport: typeof fetch = (...args) => fetch(...args)) {
  if (new URL(url).protocol !== 'https:') throw new AccessDenied();
  return createClient(url, publishableKey, { auth: { flowType: 'pkce', storageKey: 'account-managed', storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, debug: false }, global: { fetch: (...args) => transport(...args) } });
}
export interface VerifiedLogin { identity: AccountIdentity; managed: ManagedTokens; }
export interface ManagedLoginAdapter {
  begin(input: { browser: string; nonce: string }): Promise<{ url: string }>;
  complete(input: { code: string; verifier?: string }): Promise<VerifiedLogin>;
  revalidate(managed: ManagedTokens): Promise<VerifiedLogin>;
  signout(managed: ManagedTokens): Promise<void>;
}
/** No env flag, caller identity endpoint or test adapter can select a production login. */
export const productionLogin: ManagedLoginAdapter = Object.freeze({
  async begin(): Promise<never> { throw new AccessDenied(); },
  async complete(): Promise<VerifiedLogin> { throw new AccessDenied(); },
  async revalidate(): Promise<VerifiedLogin> { throw new AccessDenied(); },
  async signout(): Promise<void> { /* Local invalidation succeeds independently; managed adapter is unavailable. */ },
});
