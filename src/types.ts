import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  /** GitHub App ID (numeric, as string). */
  GH_APP_ID: string;
  /** App private key, PKCS#8 PEM. */
  GH_APP_PRIVATE_KEY: string;
  /** The App's OAuth client credentials (App settings → "Client secrets"). */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Public slug of the App, e.g. "git-repo-auth" — used for the install link. */
  GH_APP_SLUG: string;
  /** Provider state: hashed OAuth grants + transient pending records. */
  OAUTH_KV: KVNamespace;
  /** Injected by OAuthProvider on the default handler. */
  OAUTH_PROVIDER: OAuthHelpers;
}

/** Decrypted per-grant props, set at authorization, delivered on every API call. */
export interface GrantProps extends Record<string, unknown> {
  login: string;
  installationId: number;
  accountLabel: string;
}
