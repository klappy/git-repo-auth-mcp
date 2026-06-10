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

  // ---- Metering & billing (all optional: the worker runs unbilled without them) ----
  /** "true" enables quota enforcement; anything else = observe-only accounting. */
  QUOTA_ENFORCE?: string;
  /** Override the raw base for live governance docs (defaults to this repo @ main). */
  GOVERNANCE_RAW_BASE?: string;
  /** Stripe secret key — enables meter events. */
  STRIPE_SECRET_KEY?: string;
  /** Stripe webhook signing secret — enables /webhooks/stripe. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Billing Meter event name (default: git_token_mint). */
  STRIPE_METER_EVENT?: string;
  /** Checkout/pricing URL surfaced on quota walls; login is appended as client_reference_id. */
  STRIPE_UPGRADE_URL?: string;
  /** JSON map of Stripe price id → tier id, e.g. {"price_123":"pro"}. */
  STRIPE_PRICE_MAP?: string;
  /** JSON map of tier id → hosted payment link, e.g. {"pro":"https://buy.stripe.com/..."}. */
  STRIPE_PAYMENT_LINKS?: string;
}

/** Decrypted per-grant props, set at authorization, delivered on every API call. */
export interface GrantProps extends Record<string, unknown> {
  login: string;
  installationId: number;
  accountLabel: string;
}
